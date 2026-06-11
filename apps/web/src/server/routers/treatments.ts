import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// M-09 — Cabecera de tratamiento: agrupa líneas de prescripción bajo un
// objetivo clínico común. Mismo permiso que prescribir (lo gestiona el sanitario).
export const treatmentsRouter = createTRPCRouter({
  listByResident: permissionProcedure('medication:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.treatment.findMany({
        where: { residentId: input.residentId },
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
        include: {
          diagnosis: { select: { id: true, code: true, description: true } },
          medications: { select: { id: true, name: true, dose: true, active: true } },
        },
      }),
    ),

  create: permissionProcedure('medication:prescribe')
    .input(
      z.object({
        residentId: z.string(),
        name: z.string().min(1).max(160),
        diagnosisId: z.string().optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resident = await ctx.db.resident.findUnique({ where: { id: input.residentId } });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      // El diagnóstico de referencia debe ser del mismo residente (integridad + RLS).
      if (input.diagnosisId) {
        const dx = await ctx.db.diagnosis.findUnique({
          where: { id: input.diagnosisId },
          select: { residentId: true },
        });
        if (!dx || dx.residentId !== input.residentId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El diagnóstico no pertenece a este residente.' });
        }
      }
      const treatment = await ctx.db.treatment.create({
        data: {
          tenantId: ctx.tenantId,
          residentId: input.residentId,
          name: input.name,
          diagnosisId: input.diagnosisId,
          notes: input.notes,
        },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'Treatment',
        entityId: input.residentId,
        summary: `Tratamiento: ${input.name}`,
        metadata: { treatmentId: treatment.id, diagnosisId: input.diagnosisId ?? null },
      });
      return treatment;
    }),

  /** Finaliza un tratamiento (no borra: queda el histórico clínico). */
  end: permissionProcedure('medication:prescribe')
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const treatment = await ctx.db.treatment.update({
        where: { id: input.id },
        data: { active: false, endDate: new Date() },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'Treatment',
        entityId: treatment.residentId,
        summary: `Tratamiento finalizado: ${treatment.name}`,
        metadata: { treatmentId: treatment.id },
      });
      return treatment;
    }),
});
