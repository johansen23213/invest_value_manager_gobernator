import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { BedStatus } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

export const bedsRouter = createTRPCRouter({
  create: permissionProcedure('centers:write')
    .input(
      z.object({
        unitId: z.string(),
        code: z.string().min(1).max(40),
        status: z.nativeEnum(BedStatus).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.unit.findUnique({ where: { id: input.unitId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidad no encontrada.' });
      return ctx.db.bed.create({
        data: {
          unitId: input.unitId,
          code: input.code,
          status: input.status ?? BedStatus.DISPONIBLE,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('centers:write')
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(1).max(40).optional(),
        status: z.nativeEnum(BedStatus).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.bed.update({ where: { id }, data });
    }),

  delete: permissionProcedure('centers:write')
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.bed.delete({ where: { id: input.id } })),

  /** Asigna un residente a una plaza (ocupación). */
  assign: permissionProcedure('residents:write')
    .input(z.object({ bedId: z.string(), residentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [bed, resident] = await Promise.all([
        ctx.db.bed.findUnique({ where: { id: input.bedId }, include: { resident: true } }),
        ctx.db.resident.findUnique({ where: { id: input.residentId } }),
      ]);
      if (!bed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plaza no encontrada.' });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      if (bed.status === BedStatus.FUERA_SERVICIO)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La plaza está fuera de servicio.' });
      if (bed.resident && bed.resident.id !== input.residentId)
        throw new TRPCError({ code: 'CONFLICT', message: 'La plaza ya está ocupada.' });
      return ctx.db.resident.update({
        where: { id: input.residentId },
        data: { bedId: input.bedId },
      });
    }),

  /** Libera la plaza ocupada por un residente. */
  release: permissionProcedure('residents:write')
    .input(z.object({ residentId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.resident.update({ where: { id: input.residentId }, data: { bedId: null } }),
    ),
});
