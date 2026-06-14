import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma, UserRole } from '../src/index';

// Test de aislamiento multitenant a nivel de base de datos (RLS).
// Requiere DATABASE_URL (Postgres con migraciones aplicadas).
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('RLS — aislamiento multitenant', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();
  let tenantAId = '';
  let tenantBId = '';

  beforeAll(async () => {
    const a = await admin.tenant.create({ data: { name: 'Test A', slug: `rls-a-${stamp}` } });
    const b = await admin.tenant.create({ data: { name: 'Test B', slug: `rls-b-${stamp}` } });
    tenantAId = a.id;
    tenantBId = b.id;

    await admin.user.create({
      data: {
        email: `a-${stamp}@rls.dev`,
        passwordHash: 'x',
        role: UserRole.AUXILIAR,
        tenantId: a.id,
      },
    });
    await admin.user.create({
      data: {
        email: `b-${stamp}@rls.dev`,
        passwordHash: 'x',
        role: UserRole.AUXILIAR,
        tenantId: b.id,
      },
    });
  });

  afterAll(async () => {
    await admin.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it('un tenant solo ve sus propios usuarios', async () => {
    const dbA = forTenant({ tenantId: tenantAId });
    const users = await dbA.user.findMany();
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.tenantId === tenantAId)).toBe(true);
  });

  it('un tenant no puede leer usuarios de otro tenant ni forzando el where', async () => {
    const dbA = forTenant({ tenantId: tenantAId });
    const found = await dbA.user.findMany({ where: { tenantId: tenantBId } });
    expect(found).toHaveLength(0);
  });

  it('un tenant solo ve su propio registro de tenant', async () => {
    const dbA = forTenant({ tenantId: tenantAId });
    const tenants = await dbA.tenant.findMany();
    expect(tenants).toHaveLength(1);
    expect(tenants[0]?.id).toBe(tenantAId);
  });

  it('WITH CHECK impide crear datos para otro tenant', async () => {
    const dbA = forTenant({ tenantId: tenantAId });
    await expect(
      dbA.user.create({
        data: {
          email: `evil-${stamp}@rls.dev`,
          passwordHash: 'x',
          role: UserRole.AUXILIAR,
          tenantId: tenantBId,
        },
      }),
    ).rejects.toThrow();
  });

  it('sin contexto de tenant no se ve ninguna fila (falla en cerrado)', async () => {
    const dbNone = forTenant({ tenantId: null });
    const users = await dbNone.user.findMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    expect(users).toHaveLength(0);
  });

  it('el bypass de plataforma (superadmin) ve todos los tenants', async () => {
    const tenants = await admin.tenant.findMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    expect(tenants).toHaveLength(2);
  });

  it('los centros y residentes también quedan aislados por RLS', async () => {
    // El tenant A crea un centro con un residente.
    const dbA = forTenant({ tenantId: tenantAId });
    const center = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro A', type: 'RESIDENCIA' },
    });
    await dbA.resident.create({
      data: { tenantId: tenantAId, centerId: center.id, firstName: 'Ana', lastName: 'Test' },
    });

    // El tenant B no ve nada de A.
    const dbB = forTenant({ tenantId: tenantBId });
    expect(await dbB.center.findMany()).toHaveLength(0);
    expect(await dbB.resident.findMany()).toHaveLength(0);

    // A sí ve lo suyo.
    expect((await dbA.center.findMany()).length).toBeGreaterThan(0);
    expect((await dbA.resident.findMany()).length).toBeGreaterThan(0);
  });

  it('PushSubscription — aislamiento RLS entre tenants', async () => {
    // Buscar los usuarios creados en beforeAll
    const dbAdmin = asPlatformAdmin();
    const userA = await dbAdmin.user.findFirst({ where: { tenantId: tenantAId } });
    const userB = await dbAdmin.user.findFirst({ where: { tenantId: tenantBId } });

    if (!userA || !userB) throw new Error('Usuarios de test no encontrados');

    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Tenant A crea una suscripción push
    const subA = await dbA.pushSubscription.create({
      data: {
        tenantId: tenantAId,
        userId:   userA.id,
        endpoint: `https://push.example.com/rls-test-a-${stamp}`,
        p256dh:   'dGVzdC1wMjU2ZGg=',
        auth:     'dGVzdC1hdXRo',
      },
    });

    // Tenant A solo ve sus propias suscripciones
    const subsFromA = await dbA.pushSubscription.findMany();
    expect(subsFromA.every((s) => s.tenantId === tenantAId)).toBe(true);
    expect(subsFromA.some((s) => s.id === subA.id)).toBe(true);

    // Tenant B no puede ver la suscripción del tenant A
    const subsFromB = await dbB.pushSubscription.findMany({
      where: { id: subA.id },
    });
    expect(subsFromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear una suscripción para el tenant A
    await expect(
      dbB.pushSubscription.create({
        data: {
          tenantId: tenantAId, // intento de crear para otro tenant
          userId:   userB.id,
          endpoint: `https://push.example.com/rls-evil-${stamp}`,
          p256dh:   'dGVzdC1wMjU2ZGg=',
          auth:     'dGVzdC1hdXRo',
        },
      }),
    ).rejects.toThrow();

    // Limpieza
    await dbAdmin.pushSubscription.delete({ where: { id: subA.id } });
  });

  it('AdmissionRequest — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Cada tenant necesita un centro propio (centerId es obligatorio).
    const centerA = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro Adm A', type: 'RESIDENCIA' },
    });
    const centerB = await dbB.center.create({
      data: { tenantId: tenantBId, name: 'Centro Adm B', type: 'RESIDENCIA' },
    });

    // Tenant A crea una solicitud de admisión (preadmisión / lista de espera).
    const reqA = await dbA.admissionRequest.create({
      data: {
        tenantId: tenantAId,
        centerId: centerA.id,
        firstName: 'Cand',
        lastName: `A-${stamp}`,
      },
    });

    // Tenant A solo ve las suyas.
    const fromA = await dbA.admissionRequest.findMany();
    expect(fromA.every((r) => r.tenantId === tenantAId)).toBe(true);
    expect(fromA.some((r) => r.id === reqA.id)).toBe(true);

    // Tenant B no ve la solicitud de A ni forzando el where.
    const fromB = await dbB.admissionRequest.findMany({ where: { id: reqA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear una solicitud para el tenant A.
    await expect(
      dbB.admissionRequest.create({
        data: {
          tenantId: tenantAId, // intento cross-tenant
          centerId: centerB.id,
          firstName: 'Evil',
          lastName: `B-${stamp}`,
        },
      }),
    ).rejects.toThrow();

    // Limpieza.
    await dbAdmin.admissionRequest.delete({ where: { id: reqA.id } });
    await dbAdmin.center.deleteMany({ where: { id: { in: [centerA.id, centerB.id] } } });
  });
});
