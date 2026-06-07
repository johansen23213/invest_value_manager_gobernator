import { prisma } from './client';

/**
 * Contexto de tenant para una operación de base de datos.
 * - `tenantId`: tenant activo (RLS filtra por él).
 * - `bypassRls`: solo para SUPERADMIN de plataforma, seed y migraciones de datos.
 */
export interface TenantContext {
  tenantId: string | null;
  bypassRls?: boolean;
}

/**
 * Cliente Prisma con contexto de tenant. Cada operación de modelo se ejecuta en
 * una transacción que fija los GUC `app.tenant_id` y `app.bypass_rls` (locales a
 * la transacción), de modo que las políticas RLS de Postgres filtran por tenant.
 *
 * El aislamiento NO depende del código de aplicación: aunque una query olvide el
 * `where tenantId`, la RLS de la base de datos impide ver datos de otro tenant.
 */
export function forTenant(ctx: TenantContext) {
  const tenantId = ctx.tenantId ?? '';
  const bypass = ctx.bypassRls ? 'on' : 'off';

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE), set_config('app.bypass_rls', ${bypass}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/** Cliente con RLS desactivada. Solo para superadmin de plataforma / seed. */
export function asPlatformAdmin() {
  return forTenant({ tenantId: null, bypassRls: true });
}

export type TenantPrisma = ReturnType<typeof forTenant>;
