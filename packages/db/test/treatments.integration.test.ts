import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma } from '../src/index';

// M-09 — Aislamiento RLS de la tabla treatments y de su vínculo con medications.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Treatment — aislamiento RLS', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'Treat T', slug: `treat-${stamp}` } });
    const other = await admin.tenant.create({ data: { name: 'Other', slug: `treat-o-${stamp}` } });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const center = await admin.center.create({ data: { tenantId, name: 'C', type: 'RESIDENCIA' } });
    const resident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Treat', lastName: 'Test' },
    });
    residentId = resident.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('crea un tratamiento con líneas y lo lee solo su tenant', async () => {
    const db = forTenant({ tenantId });
    const treatment = await db.treatment.create({
      data: { tenantId, residentId, name: 'Control HTA' },
    });
    await db.medication.create({
      data: {
        tenantId,
        residentId,
        treatmentId: treatment.id,
        name: 'Enalapril',
        dose: '10 mg',
        times: ['08:00'],
        startDate: new Date('2026-06-01'),
      },
    });

    const mine = await db.treatment.findMany({ include: { medications: true } });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.medications).toHaveLength(1);

    const dbOther = forTenant({ tenantId: otherTenantId });
    const visible = await dbOther.treatment.findMany();
    expect(visible).toHaveLength(0);
  });

  it('otro tenant no puede escribir un tratamiento en mi tenant (WITH CHECK)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    await expect(
      dbOther.treatment.create({
        data: { tenantId, residentId, name: 'Intrusión' },
      }),
    ).rejects.toThrow();
  });
});
