/**
 * Test de integración — Módulo de Actividades (DAT-C02).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 * NO ejecutar durante migraciones en paralelo (puede colisionar con cambios de schema).
 *
 * Cubre:
 *  (a) Aislamiento RLS: otro tenant no ve actividades ni sesiones del tenant A.
 *  (b) Aforo concurrente (DAT-C02 — fix de Ronda 1): dos inscripciones CONCURRENTES
 *      a una sesión con 1 plaza libre → exactamente una queda INSCRITO y la otra
 *      LISTA_ESPERA; nunca se supera maxCapacity. Verifica el invariante del fix.
 *  (c) Promoción de lista de espera: al cancelar el único INSCRITO, el primero en
 *      LISTA_ESPERA pasa a INSCRITO.
 *  (d) Tenant nulo no ve ninguna fila (fallo cerrado).
 *
 * Nota sobre (b): el test simula concurrencia ejecutando dos inscripciones en
 * Promise.all contra Postgres real con aislamiento SERIALIZABLE. En SQLite (sin
 * serialización real) el test fallaría — se requiere Postgres. El resultado admisible
 * son dos inscripciones con estados INSCRITO + LISTA_ESPERA, o bien una que falla con
 * error de serialización (y el reintento la deja en LISTA_ESPERA). Nunca dos INSCRITO.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma } from '../src/index';
import {
  estadoInscripcion,
  primeroEnEspera,
  type InscripcionInfo,
} from '../../apps/web/src/lib/actividades';

// El router usa basePrisma (cliente sin extensión RLS) para las transacciones SERIALIZABLE.
// Aquí usamos el prisma base directamente (mismo cliente) para reproducir la lógica
// de concurrencia. El GUC de tenant se fija manualmente dentro de la transacción.
const rawPrisma = prisma;

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Actividades — integración con BD + aforo concurrente', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId = '';
  let otherTenantId = '';
  let centerId = '';
  let activityId = '';
  let residentId1 = '';
  let residentId2 = '';
  let residentId3 = '';

  beforeAll(async () => {
    // Dos tenants para pruebas de aislamiento RLS
    const tenant = await admin.tenant.create({
      data: { name: `Act Tenant ${stamp}`, slug: `act-t-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Act Other ${stamp}`, slug: `act-o-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    // Centro
    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Actividades Test', type: 'RESIDENCIA' },
    });
    centerId = center.id;

    // 3 residentes para pruebas de inscripción
    const r1 = await admin.resident.create({
      data: { tenantId, centerId, firstName: 'Residente', lastName: 'Uno' },
    });
    const r2 = await admin.resident.create({
      data: { tenantId, centerId, firstName: 'Residente', lastName: 'Dos' },
    });
    const r3 = await admin.resident.create({
      data: { tenantId, centerId, firstName: 'Residente', lastName: 'Tres' },
    });
    residentId1 = r1.id;
    residentId2 = r2.id;
    residentId3 = r3.id;

    // Actividad con aforo 1 (para el test de concurrencia)
    const activity = await admin.activity.create({
      data: {
        tenantId,
        name: 'Taller de Memoria Test',
        maxCapacity: 1,
        durationMin: 60,
      },
    });
    activityId = activity.id;
  });

  afterAll(async () => {
    await admin.activityEnrollment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.activitySession.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.activity.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.resident.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.center.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // (a) Aislamiento RLS
  // -------------------------------------------------------------------------

  it('otro tenant no ve actividades del tenant A', async () => {
    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.activity.findMany();
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (d) Fallo cerrado (tenant nulo)
  // -------------------------------------------------------------------------

  it('tenant nulo no ve actividades', async () => {
    const db = forTenant({ tenantId: null });
    const rows = await db.activity.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (b) Aforo concurrente — invariante DAT-C02
  //
  // Dos inscripciones simultáneas a sesión con maxCapacity=1.
  // Resultado requerido: exactamente 1 INSCRITO y 1 LISTA_ESPERA.
  // Nunca dos INSCRITO (superaría maxCapacity).
  //
  // El router usa basePrisma.$transaction(..., { isolationLevel: 'Serializable' }).
  // Aquí reproducimos la lógica de transacción directamente contra Postgres para
  // verificar que el invariante se cumple bajo concurrencia real.
  // -------------------------------------------------------------------------

  it('DAT-C02: dos inscripciones concurrentes a aforo=1 → exactamente 1 INSCRITO y 1 LISTA_ESPERA', async () => {
    // Crear sesión con maxCapacity=1 (vía la actividad que ya tiene maxCapacity=1)
    const session = await admin.activitySession.create({
      data: {
        tenantId,
        activityId,
        centerId,
        startsAt: new Date('2026-07-01T10:00:00Z'),
        endsAt:   new Date('2026-07-01T11:00:00Z'),
        status:   'PROGRAMADA',
      },
    });
    const sessionId = session.id;
    const maxCapacity = 1;

    // Función que inscribe un residente con la lógica serializable del router.
    // Incluye el GUC de tenant para que RLS filtre correctamente dentro de la transacción.
    async function enrollResident(residentId: string): Promise<string> {
      return rawPrisma.$transaction(
        async (tx) => {
          // Fijar GUC de tenant (RLS)
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE), set_config('app.bypass_rls', 'off', TRUE)`;

          // Comprobar idempotencia
          const existing = await tx.activityEnrollment.findUnique({
            where: { sessionId_residentId: { sessionId, residentId } },
          });
          if (existing && existing.status !== 'CANCELADO') {
            return existing.status;
          }

          // Leer inscripciones actuales dentro de la transacción serializable
          const inscripciones = await tx.activityEnrollment.findMany({
            where: { sessionId },
          });
          const inscripcionesInfo: InscripcionInfo[] = inscripciones.map((i) => ({
            id:         i.id,
            residentId: i.residentId,
            status:     i.status,
            enrolledAt: i.enrolledAt,
          }));

          const estado = estadoInscripcion({ maxCapacity }, inscripcionesInfo);

          if (existing) {
            const updated = await tx.activityEnrollment.update({
              where: { id: existing.id },
              data:  { status: estado, attended: null, observation: null, enrolledAt: new Date() },
            });
            return updated.status;
          }

          const created = await tx.activityEnrollment.create({
            data: {
              tenantId,
              sessionId,
              residentId,
              status: estado,
            },
          });
          return created.status;
        },
        { isolationLevel: 'Serializable' },
      );
    }

    // Reintento ante error de serialización (mismo patrón que el router).
    // Prisma usa P2034 para write conflict/deadlock/serialization_failure (código PG 40001).
    // El mensaje puede variar ("write conflict", "deadlock", "serializ") según la versión.
    function isSerializationError(err: unknown): boolean {
      if (!(err instanceof Error)) return false;
      const msg = err.message.toLowerCase();
      return (
        msg.includes('p2034') ||
        msg.includes('40001') ||
        msg.includes('serializ') ||
        msg.includes('write conflict') ||
        msg.includes('deadlock')
      );
    }

    async function enrollWithRetry(residentId: string): Promise<string> {
      try {
        return await enrollResident(residentId);
      } catch (err) {
        if (isSerializationError(err)) {
          return await enrollResident(residentId);
        }
        throw err;
      }
    }

    // Ejecutar las dos inscripciones en paralelo
    const [status1, status2] = await Promise.all([
      enrollWithRetry(residentId1),
      enrollWithRetry(residentId2),
    ]);

    const statuses = [status1, status2].sort();

    // Invariante DAT-C02: exactamente 1 INSCRITO y 1 LISTA_ESPERA
    expect(
      statuses,
      `Invariante DAT-C02 roto: esperado [INSCRITO, LISTA_ESPERA], obtenido [${statuses.join(', ')}]`,
    ).toEqual(['INSCRITO', 'LISTA_ESPERA']);

    // Verificar en BD que realmente hay 1 INSCRITO y 0 se superó maxCapacity
    const enrollments = await admin.activityEnrollment.findMany({
      where: { sessionId },
    });
    const inscritoCount = enrollments.filter((e) => e.status === 'INSCRITO').length;
    const listaEsperaCount = enrollments.filter((e) => e.status === 'LISTA_ESPERA').length;

    expect(
      inscritoCount,
      `maxCapacity violado: hay ${inscritoCount} INSCRITO(s), máximo era ${maxCapacity}`,
    ).toBeLessThanOrEqual(maxCapacity);
    expect(
      listaEsperaCount,
      'Debería haber exactamente 1 en LISTA_ESPERA',
    ).toBe(1);

    // Limpieza
    await admin.activityEnrollment.deleteMany({ where: { sessionId } });
    await admin.activitySession.delete({ where: { id: sessionId } });
  });

  // -------------------------------------------------------------------------
  // (c) Promoción de lista de espera
  //
  // Cuando el único INSCRITO cancela su inscripción, el primero en LISTA_ESPERA
  // (por enrolledAt más antiguo) debe pasar a INSCRITO.
  // -------------------------------------------------------------------------

  it('cancelar al único INSCRITO promueve el primero en LISTA_ESPERA a INSCRITO', async () => {
    // Sesión con aforo 1 para reproducir la lógica de promoción
    const session = await admin.activitySession.create({
      data: {
        tenantId,
        activityId,
        centerId,
        startsAt: new Date('2026-07-02T10:00:00Z'),
        endsAt:   new Date('2026-07-02T11:00:00Z'),
        status:   'PROGRAMADA',
      },
    });
    const sessionId = session.id;

    // R1 → INSCRITO (aforo lleno)
    const enrR1 = await admin.activityEnrollment.create({
      data: {
        tenantId,
        sessionId,
        residentId: residentId1,
        status: 'INSCRITO',
        enrolledAt: new Date('2026-07-01T09:00:00Z'),
      },
    });

    // R2 → LISTA_ESPERA (aforo lleno cuando se inscribió)
    const enrR2 = await admin.activityEnrollment.create({
      data: {
        tenantId,
        sessionId,
        residentId: residentId2,
        status: 'LISTA_ESPERA',
        enrolledAt: new Date('2026-07-01T09:05:00Z'),
      },
    });

    // Verificar estado inicial
    const beforeCancel = await admin.activityEnrollment.findMany({
      where: { sessionId },
      orderBy: { enrolledAt: 'asc' },
    });
    expect(beforeCancel.find((e) => e.residentId === residentId1)?.status).toBe('INSCRITO');
    expect(beforeCancel.find((e) => e.residentId === residentId2)?.status).toBe('LISTA_ESPERA');

    // Cancelar a R1 (era INSCRITO)
    await admin.activityEnrollment.update({
      where: { id: enrR1.id },
      data: { status: 'CANCELADO' },
    });

    // Simular la promoción que hace el router (primeroEnEspera → updateMany)
    const restantes = await admin.activityEnrollment.findMany({ where: { sessionId } });
    const enEsperaInfo: InscripcionInfo[] = restantes.map((i) => ({
      id:         i.id,
      residentId: i.residentId,
      status:     i.status,
      enrolledAt: i.enrolledAt,
    }));
    const promoResidentId = primeroEnEspera(enEsperaInfo);
    expect(promoResidentId).toBe(residentId2);

    await admin.activityEnrollment.updateMany({
      where: { sessionId, residentId: promoResidentId!, status: 'LISTA_ESPERA' },
      data:  { status: 'INSCRITO' },
    });

    // Verificar estado final: R1 cancelado, R2 promovido a INSCRITO
    const afterPromo = await admin.activityEnrollment.findMany({
      where: { sessionId },
    });
    expect(afterPromo.find((e) => e.residentId === residentId1)?.status).toBe('CANCELADO');
    expect(afterPromo.find((e) => e.residentId === residentId2)?.status).toBe('INSCRITO');

    // Limpieza
    await admin.activityEnrollment.deleteMany({ where: { sessionId } });
    await admin.activitySession.delete({ where: { id: session.id } });
  });

  // -------------------------------------------------------------------------
  // Aislamiento extra: LISTA_ESPERA no se propaga a otro tenant
  // -------------------------------------------------------------------------

  it('otro tenant no ve inscripciones del tenant A', async () => {
    const session = await admin.activitySession.create({
      data: {
        tenantId,
        activityId,
        startsAt: new Date('2026-07-03T10:00:00Z'),
        endsAt:   new Date('2026-07-03T11:00:00Z'),
      },
    });
    await admin.activityEnrollment.create({
      data: {
        tenantId,
        sessionId: session.id,
        residentId: residentId3,
        status: 'INSCRITO',
      },
    });

    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.activityEnrollment.findMany();
    expect(rows).toHaveLength(0);

    await admin.activityEnrollment.deleteMany({ where: { sessionId: session.id } });
    await admin.activitySession.delete({ where: { id: session.id } });
  });
});
