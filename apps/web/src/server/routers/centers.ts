import { z } from 'zod';
import { CenterType } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

const centerInput = z.object({
  name: z.string().min(2).max(120),
  type: z.nativeEnum(CenterType),
  address: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(10).optional(),
  phone: z.string().max(30).optional(),
});

export const centersRouter = createTRPCRouter({
  list: permissionProcedure('centers:read').query(({ ctx }) =>
    ctx.db.center.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { units: true, residents: true } } },
    }),
  ),

  get: permissionProcedure('centers:read')
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.center.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          units: {
            orderBy: { name: 'asc' },
            include: {
              beds: {
                orderBy: { code: 'asc' },
                include: {
                  resident: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
          _count: { select: { residents: true } },
        },
      }),
    ),

  create: permissionProcedure('centers:write')
    .input(centerInput)
    .mutation(({ ctx, input }) =>
      ctx.db.center.create({ data: { ...input, tenantId: ctx.tenantId } }),
    ),

  update: permissionProcedure('centers:write')
    .input(centerInput.partial().extend({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.center.update({ where: { id }, data });
    }),
});
