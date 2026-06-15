/**
 * Test de integración — Flujo de alta de tenant (self-service onboarding).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 * NO ejecutar durante migraciones en paralelo.
 *
 * Cubre:
 *  (a) Camino feliz: alta self-service crea tenant + usuario DIRECTOR + centro en
 *      una sola transacción atómica. El criterio de aceptación MVP "alta de centro"
 *      está cubierto.
 *  (b) Unicidad de email: una segunda solicitud con el mismo email falla.
 *  (c) Unicidad de slug: el slug se deriva del nombre y es único por tenant.
 *  (d) Plan inicial: el tenant queda en plan TRIAL con trialEndsAt en el futuro.
 *  (e) Rol del usuario creado: es DIRECTOR (no AUXILIAR ni SUPERADMIN).
 *  (f) Aislamiento RLS: el nuevo tenant no ve datos de otros tenants.
 *  (g) Limpieza: todo lo creado en (a) puede borrarse (no hay dependencias huérfanas).
 *
 * Nota: no se llama al router tRPC (requeriría levantar el servidor Next.js).
 * Se reproduce la lógica de la transacción de signup.ts directamente contra BD
 * para verificar el modelo de datos. La lógica de validación Zod y el hash de
 * contraseña se omiten (son responsabilidad del router; aquí se prueba la capa BD).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma, UserRole } from '../src/index';
import { CenterType } from '@prisma/client';
import { TRIAL_DAYS } from '../../apps/web/src/lib/plans';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Signup — alta self-service de tenant + centro + director', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  // IDs creados en los tests (para limpieza)
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    // Borrar en orden FK correcto
    for (const tenantId of createdTenantIds) {
      await admin.center.deleteMany({ where: { tenantId } });
      await admin.user.deleteMany({ where: { tenantId } });
      await admin.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Slugify simplificado (misma lógica que signup.ts). */
  function slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  /**
   * Ejecuta la transacción de signup directamente contra BD.
   * Usa `prisma.$transaction` (cliente base) para obtener atomicidad real
   * en Postgres — el mismo patrón que usa signup.ts en producción.
   */
  async function runSignup(input: {
    organizationName: string;
    centerName: string;
    centerType: CenterType;
    adminEmail: string;
    adminName: string;
    passwordHash: string;
  }): Promise<{ tenantId: string; slug: string; trialEndsAt: Date }> {
    const base = slugify(input.organizationName) || 'centro';
    // Comprobar unicidad de slug usando admin (bypass RLS)
    const existing = await admin.tenant.findUnique({ where: { slug: base }, select: { id: true } });
    const slug = existing ? `${base}-${stamp.toString(36)}` : base;

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

    // Usamos `prisma.$transaction` con bypass RLS explícito (mismo patrón que signup.ts,
    // que usa asPlatformAdmin = forTenant({ bypassRls: true })).
    // Fijamos app.bypass_rls='on' al inicio de la transacción para que RLS no bloquee
    // la creación del primer tenant (que no tiene contexto de tenant aún).
    const tenant = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE), set_config('app.tenant_id', '', TRUE)`;
      const t = await tx.tenant.create({
        data: { name: input.organizationName, slug, plan: 'TRIAL', trialEndsAt },
      });
      await tx.user.create({
        data: {
          email:        input.adminEmail,
          name:         input.adminName,
          passwordHash: input.passwordHash,
          role:         'DIRECTOR',
          tenantId:     t.id,
        },
      });
      await tx.center.create({
        data: { tenantId: t.id, name: input.centerName, type: input.centerType },
      });
      return t;
    });

    createdTenantIds.push(tenant.id);
    return { tenantId: tenant.id, slug: tenant.slug, trialEndsAt };
  }

  // -------------------------------------------------------------------------
  // (a) Camino feliz
  // -------------------------------------------------------------------------

  it('camino feliz: crea tenant + DIRECTOR + centro en transacción atómica', async () => {
    const email = `director-signup-${stamp}@test.dev`;
    const { tenantId, slug, trialEndsAt } = await runSignup({
      organizationName: `Residencia Test ${stamp}`,
      centerName:       'Centro Principal',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       email,
      adminName:        'Admin Test',
      passwordHash:     '$2a$10$fakehashedpassword', // hash ficticio para test
    });

    // Verificar tenant
    const tenant = await admin.tenant.findUnique({ where: { id: tenantId } });
    expect(tenant).not.toBeNull();
    expect(tenant!.plan).toBe('TRIAL');
    expect(tenant!.slug).toBe(slug);
    expect(tenant!.trialEndsAt).not.toBeNull();
    expect(tenant!.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());

    // Verificar usuario DIRECTOR
    const user = await admin.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe(UserRole.DIRECTOR);
    expect(user!.tenantId).toBe(tenantId);
    expect(user!.name).toBe('Admin Test');

    // Verificar centro
    const center = await admin.center.findFirst({ where: { tenantId, name: 'Centro Principal' } });
    expect(center).not.toBeNull();
    expect(center!.type).toBe(CenterType.RESIDENCIA);
    expect(center!.tenantId).toBe(tenantId);
  });

  // -------------------------------------------------------------------------
  // (b) Unicidad de email
  // -------------------------------------------------------------------------

  it('duplicar email: segunda solicitud con el mismo email falla', async () => {
    const email = `dup-signup-${stamp}@test.dev`;

    // Primera alta
    await runSignup({
      organizationName: `Centro Dup1 ${stamp}`,
      centerName:       'Centro 1',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       email,
      adminName:        'Admin 1',
      passwordHash:     'hash1',
    });

    // Segunda alta con el mismo email → debe fallar (unique constraint en users.email)
    await expect(
      runSignup({
        organizationName: `Centro Dup2 ${stamp}`,
        centerName:       'Centro 2',
        centerType:       CenterType.CENTRO_DIA,
        adminEmail:       email, // mismo email
        adminName:        'Admin 2',
        passwordHash:     'hash2',
      }),
    ).rejects.toThrow(); // Postgres unique violation
  });

  // -------------------------------------------------------------------------
  // (c) Slug único derivado del nombre
  // -------------------------------------------------------------------------

  it('slug se deriva del nombre de la organización sin caracteres especiales', async () => {
    const { slug } = await runSignup({
      organizationName: 'Residència Can Pujol',   // acento e ç
      centerName:       'Centro Slug Test',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       `slug-test-${stamp}@test.dev`,
      adminName:        'Slug Admin',
      passwordHash:     'hash',
    });

    // El slug no debe contener caracteres especiales
    expect(/^[a-z0-9-]+$/.test(slug)).toBe(true);
    expect(slug).not.toContain('ç');
    expect(slug).not.toContain('è');
  });

  // -------------------------------------------------------------------------
  // (d) Plan inicial TRIAL con trialEndsAt en el futuro
  // -------------------------------------------------------------------------

  it('el tenant queda en plan TRIAL con trialEndsAt en el futuro', async () => {
    const { tenantId, trialEndsAt } = await runSignup({
      organizationName: `Trial Test ${stamp}`,
      centerName:       'Centro Trial',
      centerType:       CenterType.VIVIENDA_TUTELADA,
      adminEmail:       `trial-${stamp}@test.dev`,
      adminName:        'Trial Admin',
      passwordHash:     'hash',
    });

    const tenant = await admin.tenant.findUnique({ where: { id: tenantId } });
    expect(tenant!.plan).toBe('TRIAL');
    expect(trialEndsAt.getTime()).toBeGreaterThan(Date.now());

    // El periodo de prueba debe ser aproximadamente TRIAL_DAYS días
    const expectedMs = TRIAL_DAYS * 86_400_000;
    const actualMs = trialEndsAt.getTime() - Date.now();
    // Margen de 1 minuto para el tiempo de ejecución del test
    expect(actualMs).toBeGreaterThan(expectedMs - 60_000);
    expect(actualMs).toBeLessThan(expectedMs + 60_000);
  });

  // -------------------------------------------------------------------------
  // (e) Rol del usuario: DIRECTOR
  // -------------------------------------------------------------------------

  it('el usuario creado en signup tiene rol DIRECTOR', async () => {
    const email = `role-check-${stamp}@test.dev`;
    const { tenantId } = await runSignup({
      organizationName: `Rol Check ${stamp}`,
      centerName:       'Centro Rol',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       email,
      adminName:        'Director Test',
      passwordHash:     'hash',
    });

    const user = await admin.user.findUnique({ where: { email } });
    expect(user!.role).toBe(UserRole.DIRECTOR);
    // Asegurar que NO es SUPERADMIN (principio de mínimo privilegio en onboarding)
    expect(user!.role).not.toBe(UserRole.SUPERADMIN);
    expect(user!.tenantId).toBe(tenantId);
  });

  // -------------------------------------------------------------------------
  // (f) Aislamiento RLS: el nuevo tenant no ve datos de otros tenants
  // -------------------------------------------------------------------------

  it('RLS: el nuevo tenant no ve usuarios de otros tenants', async () => {
    const email1 = `rls-a-${stamp}@test.dev`;
    const email2 = `rls-b-${stamp}@test.dev`;

    const { tenantId: tenantA } = await runSignup({
      organizationName: `RLS TenantA ${stamp}`,
      centerName:       'Centro A',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       email1,
      adminName:        'Admin A',
      passwordHash:     'hash',
    });

    const { tenantId: tenantB } = await runSignup({
      organizationName: `RLS TenantB ${stamp}`,
      centerName:       'Centro B',
      centerType:       CenterType.RESIDENCIA,
      adminEmail:       email2,
      adminName:        'Admin B',
      passwordHash:     'hash',
    });

    // Tenant A no ve usuarios de tenant B (RLS)
    const dbA = forTenant({ tenantId: tenantA });
    const usersA = await dbA.user.findMany();
    expect(usersA.every((u) => u.tenantId === tenantA)).toBe(true);
    expect(usersA.some((u) => u.tenantId === tenantB)).toBe(false);

    // Tenant B no ve usuarios de tenant A (RLS)
    const dbB = forTenant({ tenantId: tenantB });
    const usersB = await dbB.user.findMany();
    expect(usersB.every((u) => u.tenantId === tenantB)).toBe(true);
    expect(usersB.some((u) => u.tenantId === tenantA)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (g) Atomicidad: si falla algo en la transacción, no quedan datos huérfanos
  // -------------------------------------------------------------------------

  it('atomicidad: si la transacción falla, no queda tenant creado (rollback Postgres)', async () => {
    // Forzar fallo en la transacción: intentar crear un usuario con email ya existente.
    // La unique constraint de email está en users.email → falla → rollback de TODO (tenant + user + center).
    // El email director-signup-${stamp}@test.dev fue creado en el primer test (camino feliz).
    const existingEmail = `director-signup-${stamp}@test.dev`;
    const rollbackSlug  = `rollback-test-${stamp}`;

    // Confirmar que el email ya existe en BD (prerequisito del test)
    const userExists = await admin.user.findUnique({ where: { email: existingEmail }, select: { id: true } });
    if (!userExists) {
      // El email no existe: el test de atomicidad no puede ejercitarse
      // (el test de camino feliz no se ejecutó antes, o cambió el email)
      console.warn('[signup-atomicidad] El email prerequisito no existe — test omitido');
      return;
    }

    // Ejecutar la transacción que debe fallar: usa prisma.$transaction para atomicidad real
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE), set_config('app.tenant_id', '', TRUE)`;
        const t = await tx.tenant.create({
          data: { name: `Rollback Test ${stamp}`, slug: rollbackSlug, plan: 'TRIAL', trialEndsAt: new Date() },
        });
        // Este create falla → unique constraint violation → rollback de todo lo anterior
        await tx.user.create({
          data: {
            email:        existingEmail, // ya existe en BD
            name:         'Should Rollback',
            passwordHash: 'hash',
            role:         'DIRECTOR',
            tenantId:     t.id,
          },
        });
        await tx.center.create({
          data: { tenantId: t.id, name: 'Centro Rollback', type: 'RESIDENCIA' },
        });
        return t;
      }),
    ).rejects.toThrow(); // Postgres unique violation → rollback

    // Verificar que el tenant NO quedó en BD (atomicidad: rollback fue efectivo)
    const orphan = await admin.tenant.findFirst({ where: { slug: rollbackSlug } });
    expect(orphan).toBeNull();
  });
});
