import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  AllergySeverity,
  AssessmentType,
  ContactRelation,
  DependencyGrade,
  ResidentStatus,
  Sex,
  type TenantPrisma,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { isValidScore, type ScaleType } from '@/lib/scales';

const residentInput = z.object({
  centerId: z.string(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(120),
  birthDate: z.coerce.date().optional(),
  sex: z.nativeEnum(Sex).optional(),
  nationalId: z.string().max(20).optional(),
  dependencyGrade: z.nativeEnum(DependencyGrade).optional(),
  status: z.nativeEnum(ResidentStatus).optional(),
  admissionDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

/** Verifica que el residente pertenece al tenant (vía RLS) o lanza NOT_FOUND. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({ where: { id: residentId } });
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
}

export const residentsRouter = createTRPCRouter({
  list: permissionProcedure('residents:read').query(({ ctx }) =>
    ctx.db.resident.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        center: { select: { id: true, name: true } },
        bed: { select: { id: true, code: true, unit: { select: { name: true } } } },
      },
    }),
  ),

  get: permissionProcedure('residents:read')
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.resident.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          center: { select: { id: true, name: true } },
          bed: { select: { id: true, code: true, unit: { select: { name: true } } } },
          contacts: { orderBy: { isPrimary: 'desc' } },
          allergies: { orderBy: { substance: 'asc' } },
          diagnoses: { orderBy: { diagnosedAt: 'desc' } },
          assessments: { orderBy: { assessedAt: 'desc' } },
        },
      }),
    ),

  create: permissionProcedure('residents:write')
    .input(residentInput)
    .mutation(async ({ ctx, input }) => {
      const center = await ctx.db.center.findUnique({ where: { id: input.centerId } });
      if (!center) throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
      return ctx.db.resident.create({ data: { ...input, tenantId: ctx.tenantId } });
    }),

  update: permissionProcedure('residents:write')
    .input(residentInput.partial().extend({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.resident.update({ where: { id }, data });
    }),

  // --- Sub-recursos del expediente ---------------------------------------

  addContact: permissionProcedure('residents:write')
    .input(
      z.object({
        residentId: z.string(),
        name: z.string().min(1).max(120),
        relation: z.nativeEnum(ContactRelation),
        phone: z.string().max(30).optional(),
        email: z.string().email().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      return ctx.db.emergencyContact.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
    }),

  addAllergy: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        substance: z.string().min(1).max(120),
        severity: z.nativeEnum(AllergySeverity).optional(),
        reaction: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      return ctx.db.allergy.create({ data: { ...rest, residentId, tenantId: ctx.tenantId } });
    }),

  addDiagnosis: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        description: z.string().min(1).max(300),
        code: z.string().max(20).optional(),
        diagnosedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      return ctx.db.diagnosis.create({ data: { ...rest, residentId, tenantId: ctx.tenantId } });
    }),

  addAssessment: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        type: z.nativeEnum(AssessmentType),
        score: z.number().int(),
        assessedAt: z.coerce.date().optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidScore(input.type as ScaleType, input.score)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Puntuación fuera de rango para la escala ${input.type}.`,
        });
      }
      await assertResident(ctx.db, input.residentId);
      return ctx.db.assessment.create({
        data: {
          residentId: input.residentId,
          type: input.type,
          score: input.score,
          notes: input.notes,
          assessedAt: input.assessedAt ?? new Date(),
          assessedById: ctx.session.user.id,
          tenantId: ctx.tenantId,
        },
      });
    }),
});
