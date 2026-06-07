import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

export const unitsRouter = createTRPCRouter({
  create: permissionProcedure('centers:write')
    .input(
      z.object({
        centerId: z.string(),
        name: z.string().min(1).max(120),
        floor: z.string().max(40).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // RLS limita la consulta al tenant; si no existe, el centro no es nuestro.
      const center = await ctx.db.center.findUnique({ where: { id: input.centerId } });
      if (!center) throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
      return ctx.db.unit.create({
        data: {
          centerId: input.centerId,
          name: input.name,
          floor: input.floor,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('centers:write')
    .input(z.object({ id: z.string(), name: z.string().min(1).max(120).optional(), floor: z.string().max(40).optional() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.unit.update({ where: { id }, data });
    }),

  delete: permissionProcedure('centers:write')
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.unit.delete({ where: { id: input.id } })),
});
