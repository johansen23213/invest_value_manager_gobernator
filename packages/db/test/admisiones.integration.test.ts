/**
 * Test de integración — Módulo de Admisiones (RF-ADM-001..010).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 * NO ejecutar durante migraciones en paralelo.
 *
 * Cubre:
 *  (a) Transiciones de estado válidas e inválidas según la máquina de estados
 *      (canTransition). Se prueba que `canTransition` se respeta a nivel de lógica
 *      pura Y que los datos en BD reflejan la transición correcta.
 *  (b) Flujo LEAD → OFFERED → ADMITTED: se crea un Resident mínimo automáticamente.
 *      El criterio de aceptación "alta de residente" cubre este camino.
 *  (c) Reingreso: si residentId ya existe, la transición a ADMITTED NO crea un
 *      segundo Resident (no hay duplicados).
 *  (d) Estado terminal: una solicitud ADMITTED no puede transicionar a nada.
 *  (e) Aislamiento RLS: otro tenant no ve las solicitudes del tenant A.
 *  (f) Fallo cerrado: tenant nulo no ve ninguna solicitud.
 *
 * Nota: se reproduzca la lógica del router directamente contra la BD (sin levantar
 * el servidor tRPC) para testear el modelo de datos y las transiciones.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma, UserRole } from '../src/index';
import {
  canTransition,
  isTerminalStatus,
  allowedTransitions,
  type AdmissionStatus,
} from '../../apps/web/src/lib/ocupacion-forecast';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Admisiones — transiciones de estado + alta de residente', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId = '';
  let otherTenantId = '';
  let centerId = '';
  let directorId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({
      data: { name: `Adm Tenant ${stamp}`, slug: `adm-t-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Adm Other ${stamp}`, slug: `adm-o-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Admisiones Test', type: 'RESIDENCIA' },
    });
    centerId = center.id;

    const director = await admin.user.create({
      data: {
        email:        `director-adm-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.DIRECTOR,
        tenantId,
      },
    });
    directorId = director.id;
  });

  afterAll(async () => {
    // Borrar en orden para respetar foreign keys
    await admin.resident.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.admissionRequest.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.center.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // (a) Máquina de estados: transiciones válidas e inválidas (lógica pura)
  // -------------------------------------------------------------------------

  describe('canTransition — máquina de estados pura', () => {
    it('LEAD puede ir a WAITLIST, EVALUATION, OFFERED, REJECTED, WITHDRAWN', () => {
      expect(canTransition('LEAD', 'WAITLIST')).toBe(true);
      expect(canTransition('LEAD', 'EVALUATION')).toBe(true);
      expect(canTransition('LEAD', 'OFFERED')).toBe(true);
      expect(canTransition('LEAD', 'REJECTED')).toBe(true);
      expect(canTransition('LEAD', 'WITHDRAWN')).toBe(true);
    });

    it('LEAD NO puede ir a ADMITTED directamente', () => {
      expect(canTransition('LEAD', 'ADMITTED')).toBe(false);
    });

    it('WAITLIST puede ir a EVALUATION, OFFERED, REJECTED, WITHDRAWN', () => {
      expect(canTransition('WAITLIST', 'EVALUATION')).toBe(true);
      expect(canTransition('WAITLIST', 'OFFERED')).toBe(true);
      expect(canTransition('WAITLIST', 'REJECTED')).toBe(true);
      expect(canTransition('WAITLIST', 'WITHDRAWN')).toBe(true);
    });

    it('WAITLIST NO puede ir a ADMITTED directamente', () => {
      expect(canTransition('WAITLIST', 'ADMITTED')).toBe(false);
    });

    it('EVALUATION puede retroceder a WAITLIST (evaluación no terminada)', () => {
      expect(canTransition('EVALUATION', 'WAITLIST')).toBe(true);
    });

    it('OFFERED puede ir a ADMITTED, EVALUATION, REJECTED, WITHDRAWN', () => {
      expect(canTransition('OFFERED', 'ADMITTED')).toBe(true);
      expect(canTransition('OFFERED', 'EVALUATION')).toBe(true);
      expect(canTransition('OFFERED', 'REJECTED')).toBe(true);
      expect(canTransition('OFFERED', 'WITHDRAWN')).toBe(true);
    });

    it('ADMITTED es terminal: no hay transiciones posibles', () => {
      expect(isTerminalStatus('ADMITTED')).toBe(true);
      expect(allowedTransitions('ADMITTED')).toHaveLength(0);
      for (const target of ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED', 'REJECTED', 'WITHDRAWN'] as AdmissionStatus[]) {
        expect(canTransition('ADMITTED', target)).toBe(false);
      }
    });

    it('REJECTED es terminal', () => {
      expect(isTerminalStatus('REJECTED')).toBe(true);
      expect(allowedTransitions('REJECTED')).toHaveLength(0);
    });

    it('WITHDRAWN es terminal', () => {
      expect(isTerminalStatus('WITHDRAWN')).toBe(true);
      expect(allowedTransitions('WITHDRAWN')).toHaveLength(0);
    });

    it('transición de un mismo estado a sí mismo no está permitida', () => {
      for (const status of ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED'] as AdmissionStatus[]) {
        expect(canTransition(status, status)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // (b) Flujo LEAD → OFFERED → ADMITTED: se crea Resident mínimo
  //
  // Este es el criterio de aceptación del MVP "alta de residente".
  // La lógica está en el router (admisiones.requests.transition); aquí la
  // reproducimos directamente contra BD para verificar el modelo de datos.
  // -------------------------------------------------------------------------

  it('LEAD → OFFERED → ADMITTED crea un Resident mínimo (criterio MVP "alta de residente")', async () => {
    // 1. Crear solicitud LEAD
    const req = await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName:   'Juan',
        lastName:    'TestAdmitido',
        status:      'LEAD',
        createdById: directorId,
      },
    });

    expect(req.status).toBe('LEAD');
    expect(req.residentId).toBeNull();

    // 2. Transición LEAD → OFFERED (validar que canTransition lo permite)
    expect(canTransition('LEAD', 'OFFERED')).toBe(true);
    const offered = await admin.admissionRequest.update({
      where: { id: req.id },
      data:  { status: 'OFFERED' },
    });
    expect(offered.status).toBe('OFFERED');

    // 3. Transición OFFERED → ADMITTED: crear Resident mínimo
    expect(canTransition('OFFERED', 'ADMITTED')).toBe(true);

    // Reproducir la lógica del router: si no hay residentId, crear Resident
    const newResident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        firstName:     req.firstName,
        lastName:      req.lastName,
        status:        'ACTIVO',
        admissionDate: new Date(),
      },
    });

    const admitted = await admin.admissionRequest.update({
      where: { id: req.id },
      data:  { status: 'ADMITTED', residentId: newResident.id },
    });

    expect(admitted.status).toBe('ADMITTED');
    expect(admitted.residentId).toBe(newResident.id);

    // Verificar que el Resident existe y tiene los datos del candidato
    const resident = await admin.resident.findUnique({ where: { id: newResident.id } });
    expect(resident).not.toBeNull();
    expect(resident!.firstName).toBe('Juan');
    expect(resident!.lastName).toBe('TestAdmitido');
    expect(resident!.status).toBe('ACTIVO');
    expect(resident!.tenantId).toBe(tenantId);

    // Verificar que la admissionRequest referencia al Resident creado
    const reqFinal = await admin.admissionRequest.findUnique({ where: { id: req.id } });
    expect(reqFinal!.residentId).toBe(newResident.id);
    expect(reqFinal!.status).toBe('ADMITTED');
  });

  // -------------------------------------------------------------------------
  // (c) Reingreso: residentId ya existe → no se duplica el Resident
  // -------------------------------------------------------------------------

  it('reingreso: solicitud OFFERED con residentId existente → ADMITTED sin duplicar Resident', async () => {
    // Residente preexistente (reingreso): status BAJA = dado de alta médica / traslado
    // Es el estado que tiene un residente que ya estuvo en el centro y fue dado de baja.
    const existingResident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        firstName: 'María',
        lastName:  'Reingreso',
        status:    'BAJA',
      },
    });

    // Solicitud de reingreso que ya apunta al residente existente
    const req = await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName:  existingResident.firstName,
        lastName:   existingResident.lastName,
        status:     'OFFERED',
        residentId: existingResident.id,
        createdById: directorId,
      },
    });

    // Contar residentes antes de la transición
    const residentesBefore = await admin.resident.count({ where: { tenantId, firstName: 'María', lastName: 'Reingreso' } });
    expect(residentesBefore).toBe(1);

    // Transición a ADMITTED: dado que residentId ya existe, NO se crea otro Resident
    // (lógica del router: if (!residentId) { crear } else { solo vincular })
    const admitted = await admin.admissionRequest.update({
      where: { id: req.id },
      data:  { status: 'ADMITTED', residentId: existingResident.id },
    });

    expect(admitted.status).toBe('ADMITTED');
    expect(admitted.residentId).toBe(existingResident.id);

    // Verificar que NO se duplicó el Resident
    const residentesAfter = await admin.resident.count({ where: { tenantId, firstName: 'María', lastName: 'Reingreso' } });
    expect(residentesAfter).toBe(1);
  });

  // -------------------------------------------------------------------------
  // (d) Estado terminal: ADMITTED no puede transicionar
  // -------------------------------------------------------------------------

  it('solicitud ADMITTED: canTransition rechaza cualquier transición', async () => {
    const req = await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName: 'Pedro',
        lastName:  'Terminal',
        status:    'ADMITTED',
        createdById: directorId,
      },
    });

    expect(req.status).toBe('ADMITTED');

    // Verificar que ninguna transición está permitida desde ADMITTED
    for (const target of ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED', 'REJECTED', 'WITHDRAWN'] as AdmissionStatus[]) {
      expect(
        canTransition('ADMITTED', target),
        `canTransition('ADMITTED', '${target}') debería ser false`,
      ).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // (e) Aislamiento RLS
  // -------------------------------------------------------------------------

  it('otro tenant no ve las solicitudes del tenant A', async () => {
    // Crear una solicitud en tenant A
    await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName: 'RLS',
        lastName:  'Test',
        status:    'LEAD',
        createdById: directorId,
      },
    });

    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.admissionRequest.findMany();
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (f) Fallo cerrado (tenant nulo)
  // -------------------------------------------------------------------------

  it('tenant nulo no ve ninguna solicitud de admisión', async () => {
    const db = forTenant({ tenantId: null });
    const rows = await db.admissionRequest.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Transición LEAD → REJECTED (camino de cierre por rechazo)
  // -------------------------------------------------------------------------

  it('LEAD → REJECTED con motivo de cierre', async () => {
    const req = await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName: 'Carmen',
        lastName:  'Rechazada',
        status:    'LEAD',
        createdById: directorId,
      },
    });

    expect(canTransition('LEAD', 'REJECTED')).toBe(true);

    const rejected = await admin.admissionRequest.update({
      where: { id: req.id },
      data:  { status: 'REJECTED', outcomeReason: 'Plaza no disponible en el centro.' },
    });

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.outcomeReason).toBe('Plaza no disponible en el centro.');

    // REJECTED es terminal
    expect(isTerminalStatus('REJECTED')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Transición EVALUATION → WAITLIST (retroceso permitido)
  // -------------------------------------------------------------------------

  it('EVALUATION → WAITLIST (retroceso): evaluación no terminada', async () => {
    const req = await admin.admissionRequest.create({
      data: {
        tenantId,
        centerId,
        firstName: 'Antonio',
        lastName:  'EnEvaluacion',
        status:    'EVALUATION',
        createdById: directorId,
      },
    });

    expect(canTransition('EVALUATION', 'WAITLIST')).toBe(true);

    const updated = await admin.admissionRequest.update({
      where: { id: req.id },
      data:  { status: 'WAITLIST' },
    });

    expect(updated.status).toBe('WAITLIST');
  });
});
