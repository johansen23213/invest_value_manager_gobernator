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

  it('exporta el expediente completo con hash de integridad', async () => {
    const db = forTenant({ tenantId });
    const { data, sha256 } = await exportResidentData(db, tenantId, residentId);

    expect(data.format).toBe('vetlla-dsar-export');
    expect((data.resident as { firstName: string }).firstName).toBe('María');
    expect((data.resident as { contacts: unknown[] }).contacts).toHaveLength(1);
    expect(data.careRecords).toHaveLength(1);
    expect(data.medications).toHaveLength(1);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
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

  it('con keepClinicalRecords=false también purga la clínica', async () => {
    const db = forTenant({ tenantId });
    await anonymizeResident(db, tenantId, residentId, { keepClinicalRecords: false });
    expect(await db.careRecord.count({ where: { residentId } })).toBe(0);
    expect(await db.medication.count({ where: { residentId } })).toBe(0);
  });
});
