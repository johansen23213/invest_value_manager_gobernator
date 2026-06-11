import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyCareRecordPush,
  applyMedicationAdminPush,
  asPlatformAdmin,
  forTenant,
  prisma,
} from '../src/index';

// Ciclo de revisión humana de divergencias (R-CONF) contra Postgres con RLS:
// las divergencias nacen sin revisar (reviewed_at NULL), se pueden marcar como
// revisadas, y NUNCA son visibles para otro tenant (aislamiento del feature).
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('revisión de conflictos de sync — R-CONF', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';
  let medicationId = '';
  let authorId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'Conf T', slug: `conf-${stamp}` } });
    const other = await admin.tenant.create({ data: { name: 'Conf O', slug: `conf-o-${stamp}` } });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const user = await admin.user.create({
      data: { email: `aux-${stamp}@conf.dev`, passwordHash: 'x', role: 'AUXILIAR', tenantId },
    });
    authorId = user.id;
    const center = await admin.center.create({ data: { tenantId, name: 'C', type: 'RESIDENCIA' } });
    const resident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Conf', lastName: 'Test' },
    });
    residentId = resident.id;
    const med = await admin.medication.create({
      data: { tenantId, residentId, name: 'Enalapril', dose: '10 mg', times: ['09:00'], startDate: new Date('2026-06-01') },
    });
    medicationId = med.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('una divergencia de atención nace sin revisar y se puede marcar revisada', async () => {
    const db = forTenant({ tenantId });
    const clientId = crypto.randomUUID();
    // Primer push (servidor): tensión 120/80, editada a las 10:00.
    await applyCareRecordPush(db, tenantId, authorId, [
      {
        clientId,
        residentId,
        type: 'CONSTANTES',
        recordedAt: new Date('2026-06-11T10:00:00Z'),
        payload: { tension: '120/80' },
        fieldTimestamps: { tension: '2026-06-11T10:00:00Z' },
      },
    ]);
    // Segundo push (mismo registro, otro dispositivo): tensión 140/90, edición posterior.
    await applyCareRecordPush(db, tenantId, authorId, [
      {
        clientId,
        residentId,
        type: 'CONSTANTES',
        recordedAt: new Date('2026-06-11T10:05:00Z'),
        payload: { tension: '140/90' },
        fieldTimestamps: { tension: '2026-06-11T10:05:00Z' },
      },
    ]);

    const pending = await db.syncConflict.findMany({ where: { reviewedAt: null } });
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const conflict = pending[0]!;
    expect(conflict.reviewedAt).toBeNull();
    expect(conflict.reviewedById).toBeNull();

    // Acción de la UI: marcar revisado.
    await db.syncConflict.update({
      where: { id: conflict.id },
      data: { reviewedAt: new Date(), reviewedById: authorId },
    });

    const stillPending = await db.syncConflict.findMany({ where: { reviewedAt: null } });
    expect(stillPending.find((c) => c.id === conflict.id)).toBeUndefined();
    const reviewed = await db.syncConflict.findUniqueOrThrow({ where: { id: conflict.id } });
    expect(reviewed.reviewedById).toBe(authorId);
  });

  it('una divergencia de medicación queda pendiente de revisar al crearse', async () => {
    const db = forTenant({ tenantId });
    const at = new Date('2026-06-11T09:00:00Z');
    await applyMedicationAdminPush(db, tenantId, authorId, [
      { medicationId, scheduledAt: at, status: 'NO_ADMINISTRADO', notes: 'Ausente', recordedAt: new Date('2026-06-11T09:02:00Z') },
    ]);
    const res = await applyMedicationAdminPush(db, tenantId, authorId, [
      { medicationId, scheduledAt: at, status: 'ADMINISTRADO', recordedAt: new Date('2026-06-11T09:10:00Z') },
    ]);
    expect(res[0]?.conflict).toBe(true);

    const pending = await db.medicationSyncConflict.findMany({ where: { reviewedAt: null } });
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]?.reviewedAt).toBeNull();
  });

  it('otro tenant no ve ninguna divergencia pendiente (RLS, aislamiento del feature)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const care = await dbOther.syncConflict.findMany({ where: { reviewedAt: null } });
    const med = await dbOther.medicationSyncConflict.findMany({ where: { reviewedAt: null } });
    expect(care).toHaveLength(0);
    expect(med).toHaveLength(0);
  });
});
