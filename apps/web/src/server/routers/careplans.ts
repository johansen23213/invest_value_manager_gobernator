import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { GoalStatus } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { createCarePlanWithGoals } from '@/server/services/careplans';

export const carePlansRouter = createTRPCRouter({
  listByResident: permissionProcedure('careplan:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.carePlan.findMany({
        where: { residentId: input.residentId },
        orderBy: { startDate: 'desc' },
        include: {
          goals: { orderBy: { createdAt: 'asc' } },
          reviews: { orderBy: { reviewDate: 'desc' } },
        },
      }),
    ),

  create: permissionProcedure('careplan:write')
    .input(
      z.object({
        residentId: z.string(),
        title: z.string().min(1).max(160),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let plan;
      try {
        plan = await createCarePlanWithGoals(ctx.db, {
          tenantId: ctx.tenantId,
          createdById: ctx.session.user.id,
          input: { residentId: input.residentId, title: input.title, notes: input.notes },
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'RESIDENT_NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
        }
        throw error;
      }
      await ctx.audit({ action: 'CREATE', entity: 'CarePlan', entityId: input.residentId, summary: `PIA creado: ${input.title}` });
      return plan;
    }),

  addGoal: permissionProcedure('careplan:write')
    .input(
      z.object({
        carePlanId: z.string(),
        description: z.string().min(1).max(300),
        targetDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.carePlan.findUnique({ where: { id: input.carePlanId } });
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'PIA no encontrado.' });
      return ctx.db.carePlanGoal.create({
        data: {
          tenantId: ctx.tenantId,
          carePlanId: input.carePlanId,
          description: input.description,
          targetDate: input.targetDate,
        },
      });
    }),

  updateGoal: permissionProcedure('careplan:write')
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(GoalStatus).optional(),
        progressNotes: z.string().max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.carePlanGoal.update({ where: { id }, data });
    }),

  addReview: permissionProcedure('careplan:write')
    .input(z.object({ carePlanId: z.string(), summary: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.carePlan.findUnique({ where: { id: input.carePlanId } });
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'PIA no encontrado.' });
      const review = await ctx.db.carePlanReview.create({
        data: {
          tenantId: ctx.tenantId,
          carePlanId: input.carePlanId,
          summary: input.summary,
          reviewedById: ctx.session.user.id,
        },
      });
      await ctx.audit({ action: 'CREATE', entity: 'CarePlanReview', entityId: plan.residentId, summary: 'Revisión de PIA' });
      return review;
    }),
});
