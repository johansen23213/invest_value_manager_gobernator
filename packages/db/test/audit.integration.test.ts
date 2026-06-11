import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, logAudit, prisma } from '../src/index';

// Integración del registro de auditoría: escritura, aislamiento por RLS e
// inmutabilidad (UPDATE bloqueado por trigger).
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('AuditLog — trazabilidad RGPD', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantId = '';
  let otherTenantId = '';

  beforeAll(async () => {
    const a = await admin.tenant.create({ data: { name: 'Audit T', slug: `audit-${stamp}` } });
    const b = await admin.tenant.create({ data: { name: 'Other', slug: `audit-o-${stamp}` } });
    tenantId = a.id;
    otherTenantId = b.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it('registra una acción y la persiste en el tenant', async () => {
    const db = forTenant({ tenantId });
    await logAudit(db, {
      tenantId,
      actorId: 'u1',
      actorEmail: 'dir@audit.dev',
      action: 'CREATE',
      entity: 'Resident',
      entityId: 'r1',
      summary: 'Alta de residente',
    });
    const logs = await db.auditLog.findMany({ where: { entity: 'Resident' } });
    expect(logs.length).toBe(1);
    expect(logs[0]?.action).toBe('CREATE');
  });

  it('otro tenant no ve los registros de auditoría (RLS)', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    expect(await dbOther.auditLog.findMany()).toHaveLength(0);
  });

  it('es inmutable: no se puede modificar (UPDATE bloqueado)', async () => {
    const db = forTenant({ tenantId });
    const log = await db.auditLog.findFirstOrThrow({ where: { entity: 'Resident' } });
    await expect(
      db.auditLog.update({ where: { id: log.id }, data: { summary: 'manipulado' } }),
    ).rejects.toThrow();
  });
});
