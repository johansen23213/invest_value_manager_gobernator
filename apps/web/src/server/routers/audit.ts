import { z } from 'zod';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

export const auditRouter = createTRPCRouter({
  /** Registro de actividad del tenant (RGPD). Solo lectura, aislado por RLS. */
  list: permissionProcedure('audit:read')
    .input(
      z.object({
        entity: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.db.auditLog.findMany({
        where: {
          ...(input.entity ? { entity: input.entity } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      }),
    ),
});
