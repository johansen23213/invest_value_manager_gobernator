import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// Plan y consumo del tenant (pricing por plaza ocupada). El catálogo de
// precios/módulos vive en código (lib/plans.ts); aquí solo los datos vivos.
export const planRouter = createTRPCRouter({
  summary: permissionProcedure('tenant:read').query(async ({ ctx }) => {
    const [tenant, totalBeds, occupiedBeds] = await Promise.all([
      ctx.db.tenant.findFirst({ select: { plan: true, trialEndsAt: true, name: true } }),
      ctx.db.bed.count(),
      ctx.db.resident.count({ where: { bedId: { not: null }, status: 'ACTIVO' } }),
    ]);
    return {
      plan: tenant?.plan ?? 'TRIAL',
      trialEndsAt: tenant?.trialEndsAt ?? null,
      tenantName: tenant?.name ?? '',
      totalBeds,
      occupiedBeds,
    };
  }),
});
