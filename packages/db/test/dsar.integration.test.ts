import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymizeResident,
  asPlatformAdmin,
  exportResidentData,
  forTenant,
  prisma,
} from '../src/index';

// INC-2 — DSAR: export (art. 15) y supresión por anonimización (art. 17)
// contra Postgres con RLS. Verifica integridad, ámbito de tenant y que la
// anonimización elimina identificación directa conservando lo clínico.
//
// CRÍTICO-01/02 (2026-06-12): ampliado para cubrir tablas de Fase 1 y portal:
//   - Export v2 incluye LifeStory, ConsentRecord, Visit, etc.
//   - Anonimización limpia PII de terceros independientemente de la política.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('DSAR — export y anonimización', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';
  let userId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'DSAR T', slug: `dsar-${stamp}` } });
    const other = await admin.tenant.create({ data: { name: 'Other', slug: `dsar-o-${stamp}` } });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const user = await admin.user.create({
      data: { email: `dir-${stamp}@dsar.dev`, passwordHash: 'x', role: 'DIRECTOR', tenantId },
    });
    userId = user.id;
    const center = await admin.center.create({ data: { tenantId, name: 'C', type: 'RESIDENCIA' } });
    const resident = await admin.resident.create({
      data: {
        tenantId,
        centerId: center.id,
        firstName: 'María',
        lastName: 'García',
        nationalId: '12345678Z',
        birthDate: new Date('1940-05-01'),
      },
    });
    residentId = resident.id;
    await admin.emergencyContact.create({
      data: { tenantId, residentId, name: 'Hijo García', relation: 'HIJO_A', phone: '600000000' },
    });
    await admin.careRecord.create({
      data: {
        tenantId,
        residentId,
        type: 'CONSTANTES',
        clientId: `dsar-${stamp}`,
        payload: { fc: 70 },
        fieldTimestamps: {},
        recordedAt: new Date(),
        authorId: userId,
      },
    });
    await admin.medication.create({
      data: {
        tenantId,
        residentId,
        name: 'Paracetamol',
        dose: '1 g',
        times: ['08:00'],
        startDate: new Date('2026-06-01'),
      },
    });

    // Fase 1: datos para CRÍTICO-01/02
    await admin.lifeStory.create({
      data: {
        tenantId,
        residentId,
        profession: 'Maestra',
        importantPeople: 'Su hijo Juan y su nieta Clara',
        religion: 'Católica',
      },
    });
    await admin.consentRecord.create({
      data: {
        tenantId,
        residentId,
        type: 'INGRESO',
        granted: true,
        grantedBy: 'Juan García López',
        date: new Date('2026-01-15'),
      },
    });
    // Visit con visitantes (terceros)
    await admin.visit.create({
      data: {
        tenantId,
        residentId,
        requestedById: userId,
        scheduledAt: new Date(),
        visitorNames: ['Juan García', 'Clara García'],
        status: 'CONFIRMADA',
      },
    });
    // ServiceRequest con comentario interno
    const req = await admin.serviceRequest.create({
      data: {
        tenantId,
        residentId,
        createdById: userId,
        category: 'ADMINISTRACION',
        title: 'Solicitud de documentación',
        description: 'Necesito el informe médico',
      },
    });
    await admin.serviceRequestComment.create({
      data: {
        tenantId,
        requestId: req.id,
        authorId: userId,
        body: 'Nota interna del staff: revisar expediente antes de responder',
        internal: true,
      },
    });
    // MessageThread + Message
    const thread = await admin.messageThread.create({
      data: {
        tenantId,
        residentId,
        subject: 'Consulta general',
        createdById: userId,
      },
    });
    await admin.message.create({
      data: {
        tenantId,
        threadId: thread.id,
        authorId: userId,
        body: 'Mensaje de prueba',
      },
    });

    // Residente de OTRO tenant: jamás debe aparecer en exports ajenos.
    const otherCenter = await admin.center.create({
      data: { tenantId: otherTenantId, name: 'OC', type: 'RESIDENCIA' },
    });
    await admin.resident.create({
      data: {
        tenantId: otherTenantId,
        centerId: otherCenter.id,
        firstName: 'Otro',
        lastName: 'Tenant',
      },
    });
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('exporta el expediente completo con hash de integridad (v9)', async () => {
    const db = forTenant({ tenantId });
    const { data, sha256 } = await exportResidentData(db, tenantId, residentId);

    expect(data.format).toBe('vetlla-dsar-export');
    expect(data.version).toBe(10);
    expect((data.resident as { firstName: string }).firstName).toBe('María');
    expect((data.resident as { contacts: unknown[] }).contacts).toHaveLength(1);
    expect(data.careRecords).toHaveLength(1);
    expect(data.medications).toHaveLength(1);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('export v2 incluye LifeStory con datos de categoría especial', async () => {
    const db = forTenant({ tenantId });
    const { data } = await exportResidentData(db, tenantId, residentId);

    expect(data.lifeStory).not.toBeNull();
    expect((data.lifeStory as { religion: string }).religion).toBe('Católica');
    expect((data.lifeStory as { importantPeople: string }).importantPeople).toContain('Juan');
  });

  it('export v2 incluye ConsentRecord', async () => {
    const db = forTenant({ tenantId });
    const { data } = await exportResidentData(db, tenantId, residentId);

    expect(data.consents).toHaveLength(1);
    expect((data.consents[0] as { grantedBy: string }).grantedBy).toBe('Juan García López');
  });

  it('export v2 incluye Visit con visitorNames', async () => {
    const db = forTenant({ tenantId });
    const { data } = await exportResidentData(db, tenantId, residentId);

    expect(data.visits).toHaveLength(1);
    expect(data.visits[0]).toMatchObject({ visitorNames: ['Juan García', 'Clara García'] });
  });

  it('export v2 incluye ServiceRequest con comentarios internos (art. 15 cubre todos los datos)', async () => {
    const db = forTenant({ tenantId });
    const { data } = await exportResidentData(db, tenantId, residentId);

    expect(data.serviceRequests).toHaveLength(1);
    const req = data.serviceRequests[0] as { comments: unknown[] };
    // Los comentarios internos SE INCLUYEN: son datos personales del interesado.
    expect(req.comments).toHaveLength(1);
  });

  it('export v2 incluye MessageThread con mensajes', async () => {
    const db = forTenant({ tenantId });
    const { data } = await exportResidentData(db, tenantId, residentId);

    expect(data.messageThreads).toHaveLength(1);
    const thread = data.messageThreads[0] as { messages: unknown[] };
    expect(thread.messages).toHaveLength(1);
  });

  it('no puede exportar un residente de otro tenant (RLS)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    await expect(exportResidentData(dbOther, otherTenantId, residentId)).rejects.toThrow(
      /no encontrado/,
    );
  });

  it('anonimiza: PII directa fuera, contactos borrados, clínica conservada', async () => {
    const db = forTenant({ tenantId });
    const result = await anonymizeResident(db, tenantId, residentId);

    expect(result.pseudonym).toMatch(/^R-[0-9A-F]{8}$/);
    expect(result.contactsDeleted).toBe(1);
    expect(result.clinicalRecordsKept).toBe(true);

    const after = await db.resident.findUniqueOrThrow({ where: { id: residentId } });
    expect(after.firstName).toBe('Anonimizado');
    expect(after.lastName).toBe(result.pseudonym);
    expect(after.nationalId).toBeNull();
    expect(after.birthDate).toBeNull();
    expect(after.status).toBe('BAJA');

    // La clínica disociada sigue (obligación de conservación sanitaria).
    expect(await db.careRecord.count({ where: { residentId } })).toBe(1);
    expect(await db.medication.count({ where: { residentId } })).toBe(1);
    expect(await db.emergencyContact.count({ where: { residentId } })).toBe(0);
  });

  it('anonimiza SIEMPRE: LifeStory se borra (datos art. 9 + PII de terceros)', async () => {
    const db = forTenant({ tenantId });
    // Crear nueva LifeStory (la anterior pudo haber sido borrada en el test anterior)
    await admin.lifeStory.upsert({
      where: { residentId },
      create: {
        tenantId,
        residentId,
        religion: 'Protestante',
        importantPeople: 'Hija Ana',
      },
      update: { religion: 'Protestante', importantPeople: 'Hija Ana' },
    });

    await anonymizeResident(db, tenantId, residentId);

    // LifeStory debe haber sido borrada independientemente de la política.
    expect(await db.lifeStory.findUnique({ where: { residentId } })).toBeNull();
  });

  it('anonimiza SIEMPRE: ConsentRecord.grantedBy -> null', async () => {
    const db = forTenant({ tenantId });
    // Crear un ConsentRecord fresco para este check
    await admin.consentRecord.create({
      data: {
        tenantId,
        residentId,
        type: 'IMAGEN',
        granted: true,
        grantedBy: 'Ana García',
        date: new Date(),
      },
    });

    await anonymizeResident(db, tenantId, residentId);

    const consents = await db.consentRecord.findMany({ where: { residentId } });
    for (const c of consents) {
      expect(c.grantedBy).toBeNull();
    }
  });

  it('anonimiza SIEMPRE: Visit.visitorNames -> []', async () => {
    const db = forTenant({ tenantId });
    // Crear una visita fresca
    await admin.visit.create({
      data: {
        tenantId,
        residentId,
        requestedById: userId,
        scheduledAt: new Date(Date.now() + 86400000),
        visitorNames: ['Familiar Uno', 'Familiar Dos'],
        status: 'SOLICITADA',
      },
    });

    await anonymizeResident(db, tenantId, residentId);

    const visits = await db.visit.findMany({ where: { residentId } });
    for (const v of visits) {
      expect(v.visitorNames).toEqual([]);
    }
  });

  it('con keepClinicalRecords=false también purga la clínica y las tablas nuevas', async () => {
    const db = forTenant({ tenantId });
    // Crear datos de Fase 1 para que el purge los elimine
    await admin.vaccine.create({
      data: { tenantId, residentId, type: 'gripe', date: new Date() },
    });
    await admin.weightRecord.create({
      data: { tenantId, residentId, weightKg: 65, recordedAt: new Date() },
    });

    await anonymizeResident(db, tenantId, residentId, { keepClinicalRecords: false });

    expect(await db.careRecord.count({ where: { residentId } })).toBe(0);
    expect(await db.medication.count({ where: { residentId } })).toBe(0);
    expect(await db.vaccine.count({ where: { residentId } })).toBe(0);
    expect(await db.weightRecord.count({ where: { residentId } })).toBe(0);
    expect(await db.consentRecord.count({ where: { residentId } })).toBe(0);
    expect(await db.lifeStory.findUnique({ where: { residentId } })).toBeNull();
    expect(await db.visit.count({ where: { residentId } })).toBe(0);
    expect(await db.serviceRequest.count({ where: { residentId } })).toBe(0);
    expect(await db.messageThread.count({ where: { residentId } })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test de inmutabilidad DELETE en audit_logs (CRÍTICO-03)
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)('AuditLog — DELETE bloqueado para vetlla_app (CRÍTICO-03)', () => {
  const admin = asPlatformAdmin();
  const stamp2 = Date.now() + 1;
  let tenantId2 = '';

  beforeAll(async () => {
    const t = await admin.tenant.create({ data: { name: 'Del T', slug: `del-${stamp2}` } });
    tenantId2 = t.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: tenantId2 } });
    await prisma.$disconnect();
  });

  it('vetlla_app no puede borrar filas de audit_logs (REVOKE DELETE)', async () => {
    // Insertamos con el admin para tener algo
    const db = forTenant({ tenantId: tenantId2 });
    const { logAudit } = await import('../src/audit');
    await logAudit(db, {
      tenantId: tenantId2,
      action: 'TEST',
      entity: 'Test',
      summary: 'Intento de borrado',
    });

    // Intentar borrar como vetlla_app (cliente tenantPrisma = vetlla_app)
    // Debe lanzar error de permisos (privilege denied) O del trigger.
    await expect(
      db.auditLog.deleteMany({ where: { tenantId: tenantId2 } }),
    ).rejects.toThrow();
  });
});
