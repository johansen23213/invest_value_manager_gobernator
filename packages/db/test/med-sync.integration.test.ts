import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMedicationAdminPush, asPlatformAdmin, forTenant, prisma } from '../src/index';
import type { IncomingMedAdminEvent } from '../src/index';

// Integración del sync del MAR (ADR-0012) contra Postgres con RLS:
// idempotencia por clave natural, LWW por evento, conflicto persistido y aislamiento.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('applyMedicationAdminPush — MAR offline', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';
  let medicationId = '';
  let authorId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'MedSync T', slug: `medsync-${stamp}` } });
    const other = await admin.tenant.create({ data: { name: 'Other', slug: `medsync-o-${stamp}` } });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const user = await admin.user.create({
      data: { email: `aux-${stamp}@medsync.dev`, passwordHash: 'x', role: 'AUXILIAR', tenantId },
    });
    authorId = user.id;
    const center = await admin.center.create({ data: { tenantId, name: 'C', type: 'RESIDENCIA' } });
    const resident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Med', lastName: 'Sync' },
    });
    const med = await admin.medication.create({
      data: {
        tenantId,
        residentId: resident.id,
        name: 'Paracetamol',
        dose: '1 g',
        times: ['08:00'],
        startDate: new Date('2026-06-01'),
      },
    });
    medicationId = med.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  const scheduledAt = new Date('2026-06-11T08:00:00Z');

  function ev(overrides: Partial<IncomingMedAdminEvent> = {}): IncomingMedAdminEvent {
    return {
      medicationId,
      scheduledAt,
      status: 'ADMINISTRADO',
      recordedAt: new Date('2026-06-11T08:05:00Z'),
      ...overrides,
    };
  }

  it('reenviar el mismo evento no duplica ni genera conflicto (retry de red)', async () => {
    const db = forTenant({ tenantId });
    const r1 = await applyMedicationAdminPush(db, tenantId, authorId, [ev()]);
    const r2 = await applyMedicationAdminPush(db, tenantId, authorId, [ev()]);

    expect(r1[0]?.status).toBe('CREATED');
    expect(r2[0]?.status).toBe('MERGED');
    expect(r2[0]?.conflict).toBe(false);
    expect(r1[0]?.id).toBe(r2[0]?.id);

    const count = await db.medicationAdministration.count({ where: { medicationId, scheduledAt } });
    expect(count).toBe(1);
  });

  it('dos dispositivos divergen -> gana el más reciente y queda el conflicto para revisión', async () => {
    const db = forTenant({ tenantId });
    const at = new Date('2026-06-11T12:00:00Z');
    // Dispositivo A (offline, registró antes): no administrado.
    await applyMedicationAdminPush(db, tenantId, authorId, [
      ev({ scheduledAt: at, status: 'NO_ADMINISTRADO', notes: 'Dormido', recordedAt: new Date('2026-06-11T12:02:00Z') }),
    ]);
    // Dispositivo B (registró después): administrado.
    const res = await applyMedicationAdminPush(db, tenantId, authorId, [
      ev({ scheduledAt: at, status: 'ADMINISTRADO', recordedAt: new Date('2026-06-11T12:10:00Z') }),
    ]);

    expect(res[0]?.winner).toBe('CLIENT');
    expect(res[0]?.conflict).toBe(true);

    const saved = await db.medicationAdministration.findFirstOrThrow({
      where: { medicationId, scheduledAt: at },
    });
    expect(saved.status).toBe('ADMINISTRADO'); // ganó el evento completo más reciente
    expect(saved.notes).toBeNull(); // sin mezclar campos del perdedor

    const conflicts = await db.medicationSyncConflict.findMany({
      where: { administrationId: saved.id },
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.winner).toBe('CLIENT');
    expect((conflicts[0]?.serverEvent as { status: string }).status).toBe('NO_ADMINISTRADO');
  });

  it('una medicación de otro tenant no es alcanzable (RLS)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    await expect(
      applyMedicationAdminPush(dbOther, otherTenantId, authorId, [ev()]),
    ).rejects.toThrow(/no encontrada/);
  });

  it('los conflictos de medicación están aislados por tenant (RLS)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const visible = await dbOther.medicationSyncConflict.findMany();
    expect(visible).toHaveLength(0);
  });
});
