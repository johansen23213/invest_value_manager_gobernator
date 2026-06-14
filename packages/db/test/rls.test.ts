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

  it('ActivityEnrollment — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Cada tenant necesita un centro y un residente.
    const centerA = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro Act A', type: 'RESIDENCIA' },
    });
    const centerB = await dbB.center.create({
      data: { tenantId: tenantBId, name: 'Centro Act B', type: 'RESIDENCIA' },
    });
    const residentA = await dbA.resident.create({
      data: { tenantId: tenantAId, centerId: centerA.id, firstName: 'Resident', lastName: 'A-Act' },
    });
    const residentB = await dbB.resident.create({
      data: { tenantId: tenantBId, centerId: centerB.id, firstName: 'Resident', lastName: 'B-Act' },
    });

    // Cada tenant crea una actividad y una sesión.
    const activityA = await dbA.activity.create({
      data: { tenantId: tenantAId, name: 'Taller memoria A', maxCapacity: 10, durationMin: 60 },
    });
    const activityB = await dbB.activity.create({
      data: { tenantId: tenantBId, name: 'Taller memoria B', maxCapacity: 10, durationMin: 60 },
    });
    const sessionA = await dbA.activitySession.create({
      data: {
        tenantId:   tenantAId,
        activityId: activityA.id,
        startsAt:   new Date('2026-07-01T10:00:00Z'),
        endsAt:     new Date('2026-07-01T11:00:00Z'),
      },
    });
    const sessionB = await dbB.activitySession.create({
      data: {
        tenantId:   tenantBId,
        activityId: activityB.id,
        startsAt:   new Date('2026-07-01T10:00:00Z'),
        endsAt:     new Date('2026-07-01T11:00:00Z'),
      },
    });

    // Tenant A crea una inscripción para su residente.
    const enrollmentA = await dbA.activityEnrollment.create({
      data: {
        tenantId:   tenantAId,
        sessionId:  sessionA.id,
        residentId: residentA.id,
        status:     'INSCRITO',
      },
    });

    // Tenant A ve su inscripción.
    const fromA = await dbA.activityEnrollment.findMany();
    expect(fromA.every((e) => e.tenantId === tenantAId)).toBe(true);
    expect(fromA.some((e) => e.id === enrollmentA.id)).toBe(true);

    // Tenant B no ve la inscripción de A (ni forzando el where).
    const fromB = await dbB.activityEnrollment.findMany({ where: { id: enrollmentA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear una inscripción para el tenant A.
    await expect(
      dbB.activityEnrollment.create({
        data: {
          tenantId:   tenantAId, // intento cross-tenant
          sessionId:  sessionB.id,
          residentId: residentB.id,
          status:     'INSCRITO',
        },
      }),
    ).rejects.toThrow();

    // Limpieza.
    await dbAdmin.activityEnrollment.delete({ where: { id: enrollmentA.id } });
    await dbAdmin.activitySession.deleteMany({ where: { id: { in: [sessionA.id, sessionB.id] } } });
    await dbAdmin.activity.deleteMany({ where: { id: { in: [activityA.id, activityB.id] } } });
    await dbAdmin.resident.deleteMany({ where: { id: { in: [residentA.id, residentB.id] } } });
    await dbAdmin.center.deleteMany({ where: { id: { in: [centerA.id, centerB.id] } } });
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

  it('Diagnosis (con estado) — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Cada tenant necesita un centro y un residente.
    const centerA = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro Dx A', type: 'RESIDENCIA' },
    });
    const centerB = await dbB.center.create({
      data: { tenantId: tenantBId, name: 'Centro Dx B', type: 'RESIDENCIA' },
    });
    const residentA = await dbA.resident.create({
      data: { tenantId: tenantAId, centerId: centerA.id, firstName: 'Ana', lastName: `Dx-${stamp}` },
    });
    const residentB = await dbB.resident.create({
      data: { tenantId: tenantBId, centerId: centerB.id, firstName: 'Bob', lastName: `Dx-${stamp}` },
    });

    // Tenant A crea un diagnóstico.
    const dxA = await dbA.diagnosis.create({
      data: {
        tenantId:    tenantAId,
        residentId:  residentA.id,
        description: 'Hipertensión arterial esencial',
        type:        'PRINCIPAL',
        status:      'CRONICO',
      },
    });

    // Tenant A ve su diagnóstico; sus diagnósticos tienen todos tenantId correcto.
    const fromA = await dbA.diagnosis.findMany();
    expect(fromA.some((d) => d.id === dxA.id)).toBe(true);
    expect(fromA.every((d) => d.tenantId === tenantAId)).toBe(true);

    // Tenant B no ve el diagnóstico de A ni forzando el where.
    const fromB = await dbB.diagnosis.findMany({ where: { id: dxA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear un diagnóstico para el tenant A.
    await expect(
      dbB.diagnosis.create({
        data: {
          tenantId:    tenantAId, // intento cross-tenant
          residentId:  residentB.id,
          description: 'Diagnóstico malicioso',
          type:        'SECUNDARIO',
          status:      'ACTIVO',
        },
      }),
    ).rejects.toThrow();

    // Limpieza (orden: diagnóstico → residente → centro).
    await dbAdmin.diagnosis.delete({ where: { id: dxA.id } });
    await dbAdmin.resident.deleteMany({ where: { id: { in: [residentA.id, residentB.id] } } });
    await dbAdmin.center.deleteMany({ where: { id: { in: [centerA.id, centerB.id] } } });
  });

  it('AssistiveDevice — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Cada tenant necesita un centro y un residente.
    const centerA = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro AD A', type: 'RESIDENCIA' },
    });
    const centerB = await dbB.center.create({
      data: { tenantId: tenantBId, name: 'Centro AD B', type: 'RESIDENCIA' },
    });
    const residentA = await dbA.resident.create({
      data: { tenantId: tenantAId, centerId: centerA.id, firstName: 'Ana', lastName: `AD-${stamp}` },
    });
    const residentB = await dbB.resident.create({
      data: { tenantId: tenantBId, centerId: centerB.id, firstName: 'Bob', lastName: `AD-${stamp}` },
    });

    // Tenant A crea una ayuda técnica.
    const deviceA = await dbA.assistiveDevice.create({
      data: {
        tenantId:     tenantAId,
        residentId:   residentA.id,
        type:         'SILLA_RUEDAS',
        description:  'Invacare Action 3 NG',
        prescribedAt: new Date('2026-01-10'),
        status:       'ACTIVO',
        ownedByCenter: false,
      },
    });

    // Tenant A ve su ayuda técnica.
    const fromA = await dbA.assistiveDevice.findMany();
    expect(fromA.some((d) => d.id === deviceA.id)).toBe(true);
    expect(fromA.every((d) => d.tenantId === tenantAId)).toBe(true);

    // Tenant B no ve la ayuda técnica de A ni forzando el where.
    const fromB = await dbB.assistiveDevice.findMany({ where: { id: deviceA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear una ayuda técnica para el tenant A.
    await expect(
      dbB.assistiveDevice.create({
        data: {
          tenantId:     tenantAId, // intento cross-tenant
          residentId:   residentB.id,
          type:         'ANDADOR',
          prescribedAt: new Date('2026-01-10'),
          status:       'ACTIVO',
          ownedByCenter: true,
        },
      }),
    ).rejects.toThrow();

    // Limpieza.
    await dbAdmin.assistiveDevice.delete({ where: { id: deviceA.id } });
    await dbAdmin.resident.deleteMany({ where: { id: { in: [residentA.id, residentB.id] } } });
    await dbAdmin.center.deleteMany({ where: { id: { in: [centerA.id, centerB.id] } } });
  });

  it('ResidentBelonging — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Cada tenant necesita un centro y un residente.
    const centerA = await dbA.center.create({
      data: { tenantId: tenantAId, name: 'Centro Bel A', type: 'RESIDENCIA' },
    });
    const centerB = await dbB.center.create({
      data: { tenantId: tenantBId, name: 'Centro Bel B', type: 'RESIDENCIA' },
    });
    const residentA = await dbA.resident.create({
      data: { tenantId: tenantAId, centerId: centerA.id, firstName: 'Ana', lastName: `Bel-${stamp}` },
    });
    const residentB = await dbB.resident.create({
      data: { tenantId: tenantBId, centerId: centerB.id, firstName: 'Bob', lastName: `Bel-${stamp}` },
    });

    // Tenant A registra una pertenencia para su residente.
    const bA = await dbA.residentBelonging.create({
      data: {
        tenantId:    tenantAId,
        residentId:  residentA.id,
        description: 'Chaqueta azul marino',
        category:    'ROPA',
        quantity:    1,
        status:      'EN_USO',
      },
    });

    // Tenant A ve su pertenencia.
    const fromA = await dbA.residentBelonging.findMany();
    expect(fromA.some((b) => b.id === bA.id)).toBe(true);
    expect(fromA.every((b) => b.tenantId === tenantAId)).toBe(true);

    // Tenant B no ve la pertenencia de A ni forzando el where.
    const fromB = await dbB.residentBelonging.findMany({ where: { id: bA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear una pertenencia para el tenant A.
    await expect(
      dbB.residentBelonging.create({
        data: {
          tenantId:    tenantAId, // intento cross-tenant
          residentId:  residentB.id,
          description: 'Pertenencia maliciosa',
          category:    'OTRO',
          quantity:    1,
          status:      'EN_USO',
        },
      }),
    ).rejects.toThrow();

    // Limpieza.
    await dbAdmin.residentBelonging.delete({ where: { id: bA.id } });
    await dbAdmin.resident.deleteMany({ where: { id: { in: [residentA.id, residentB.id] } } });
    await dbAdmin.center.deleteMany({ where: { id: { in: [centerA.id, centerB.id] } } });
  });

  it('InventoryItem — aislamiento RLS entre tenants', async () => {
    const dbAdmin = asPlatformAdmin();
    const dbA = forTenant({ tenantId: tenantAId });
    const dbB = forTenant({ tenantId: tenantBId });

    // Tenant A crea un artículo de inventario.
    const itemA = await dbA.inventoryItem.create({
      data: {
        tenantId: tenantAId,
        name:     `Absorbentes M-${stamp}`,
        category: 'ABSORBENTES',
        unit:     'unidad',
        stock:    100,
        stockMin: 20,
      },
    });

    // Tenant A ve su artículo.
    const fromA = await dbA.inventoryItem.findMany();
    expect(fromA.some((i) => i.id === itemA.id)).toBe(true);
    expect(fromA.every((i) => i.tenantId === tenantAId)).toBe(true);

    // Tenant B no ve el artículo de A ni forzando el where.
    const fromB = await dbB.inventoryItem.findMany({ where: { id: itemA.id } });
    expect(fromB).toHaveLength(0);

    // WITH CHECK: Tenant B no puede crear un artículo para el tenant A.
    await expect(
      dbB.inventoryItem.create({
        data: {
          tenantId: tenantAId, // intento cross-tenant
          name:     'Artículo malicioso',
          category: 'OTRO',
          unit:     'unidad',
          stock:    0,
          stockMin: 0,
        },
      }),
    ).rejects.toThrow();

    // Limpieza.
    await dbAdmin.inventoryItem.delete({ where: { id: itemA.id } });
  });
});
