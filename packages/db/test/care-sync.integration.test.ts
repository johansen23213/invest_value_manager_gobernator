import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyCareRecordPush, asPlatformAdmin, forTenant, prisma } from '../src/index';
import type { IncomingCareRecord } from '../src/index';

// Integración del motor de sync contra Postgres con RLS. Verifica las dos
// garantías críticas de H3: idempotencia (sin duplicados) y LWW por campo.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('applyCareRecordPush — sincronización offline', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';
  let authorId = '';

  beforeAll(async () => {
    const tenant = await admin.tenant.create({ data: { name: 'Sync T', slug: `sync-${stamp}` } });
    const other = await admin.tenant.create({ data: { name: 'Other', slug: `sync-o-${stamp}` } });
    tenantId = tenant.id;
    otherTenantId = other.id;
    const user = await admin.user.create({
      data: { email: `aux-${stamp}@sync.dev`, passwordHash: 'x', role: 'AUXILIAR', tenantId },
    });
    authorId = user.id;
    const center = await admin.center.create({
      data: { tenantId, name: 'C', type: 'RESIDENCIA' },
    });
    const resident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Test', lastName: 'Sync' },
    });
    residentId = resident.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  function record(overrides: Partial<IncomingCareRecord> = {}): IncomingCareRecord {
    return {
      clientId: `c-${stamp}-1`,
      residentId,
      type: 'CONSTANTES',
      recordedAt: new Date(),
      payload: { tension: '120/80', fc: 72 },
      fieldTimestamps: { tension: '2026-06-07T08:00:00.000Z', fc: '2026-06-07T08:00:00.000Z' },
      ...overrides,
    };
  }

  it('reenviar el mismo clientId no crea duplicados', async () => {
    const db = forTenant({ tenantId });
    const r1 = await applyCareRecordPush(db, tenantId, authorId, [record()]);
    const r2 = await applyCareRecordPush(db, tenantId, authorId, [record()]);

    expect(r1[0]?.status).toBe('CREATED');
    expect(r2[0]?.status).toBe('MERGED');
    expect(r1[0]?.id).toBe(r2[0]?.id);

    const count = await db.careRecord.count({ where: { clientId: `c-${stamp}-1` } });
    expect(count).toBe(1);
  });

  it('aplica last-write-wins por campo y registra el conflicto', async () => {
    const db = forTenant({ tenantId });
    const clientId = `c-${stamp}-2`;
    await applyCareRecordPush(db, tenantId, authorId, [
      record({ clientId, payload: { fc: 70 }, fieldTimestamps: { fc: '2026-06-07T08:00:00.000Z' } }),
    ]);
    // Edición posterior del mismo campo desde otro dispositivo.
    const res = await applyCareRecordPush(db, tenantId, authorId, [
      record({ clientId, payload: { fc: 95 }, fieldTimestamps: { fc: '2026-06-07T10:00:00.000Z' } }),
    ]);

    expect(res[0]?.conflicts).toBe(1);
    const saved = await db.careRecord.findFirstOrThrow({ where: { clientId } });
    expect((saved.payload as { fc: number }).fc).toBe(95); // gana el más reciente
    expect(saved.syncStatus).toBe('CONFLICT');
    const conflicts = await db.syncConflict.findMany({ where: { careRecordId: saved.id } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.winner).toBe('CLIENT');
  });

  it('otro tenant no ve los registros (RLS)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const visible = await dbOther.careRecord.findMany();
    expect(visible).toHaveLength(0);
  });
});
