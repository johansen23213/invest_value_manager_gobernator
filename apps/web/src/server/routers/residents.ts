import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  AllergySeverity,
  AllergyType,
  AssessmentType,
  ContactRelation,
  DependencyGrade,
  DietType,
  LiquidTexture,
  PlaceRegime,
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
  // --- Fase 1: Bloque A — Identificación y administrativo ---
  internalRecordNo:   z.string().max(60).optional(),
  cip:                z.string().max(30).optional(),
  socialSecurityNo:   z.string().max(30).optional(),
  insurerName:        z.string().max(120).optional(),
  placeRegime:        z.nativeEnum(PlaceRegime).optional(),
  dischargeDate:      z.coerce.date().optional(),
  dischargeReason:    z.string().max(300).optional(),
  originCenter:       z.string().max(200).optional(),
  nationalIdExpiry:   z.coerce.date().optional(),
  judicialCapacity:   z.boolean().optional(),
  legalRepName:       z.string().max(120).optional(),
  legalRepPhone:      z.string().max(30).optional(),
  legalRepEmail:      z.string().email().optional().or(z.literal('')),
  advanceDirectives:  z.boolean().optional(),
  advanceDirLocation: z.string().max(300).optional(),
  preferredLanguage:  z.string().max(10).optional(),
  bloodGroup:         z.string().max(10).optional(),
  // --- Fase 1: Consentimientos RGPD (resumen de estado) ---
  consentImage:        z.boolean().optional(),
  consentFamilyPortal: z.boolean().optional(),
  consentAdmission:    z.coerce.date().optional(),
  // --- Fase 1: Ficha de cuidados operativos ---
  dietType:             z.nativeEnum(DietType).optional(),
  liquidTexture:        z.nativeEnum(LiquidTexture).optional(),
  nutritionSupplements: z.string().max(300).optional(),
  continenceType:       z.string().max(100).optional(),
  absorbentSize:        z.string().max(10).optional(),
  wanderingRisk:        z.boolean().optional(),
  fallRisk:             z.boolean().optional(),
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
      const resident = await ctx.db.resident.create({ data: { ...input, tenantId: ctx.tenantId } });
      await ctx.audit({
        action: 'CREATE',
        entity: 'Resident',
        entityId: resident.id,
        summary: `Alta de residente ${resident.firstName} ${resident.lastName}`,
      });
      return resident;
    }),

  update: permissionProcedure('residents:write')
    .input(residentInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const resident = await ctx.db.resident.update({ where: { id }, data });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'Resident',
        entityId: id,
        summary: `Modificación del expediente de ${resident.firstName} ${resident.lastName}`,
      });
      return resident;
    }),

  // --- Sub-recursos del expediente ---------------------------------------

  addContact: permissionProcedure('residents:write')
    .input(
      z.object({
        residentId:    z.string(),
        name:          z.string().min(1).max(120),
        relation:      z.nativeEnum(ContactRelation),
        phone:         z.string().max(30).optional(),
        email:         z.string().email().optional(),
        isPrimary:     z.boolean().optional(),
        // Fase 1: datos adicionales del contacto
        callOrder:     z.number().int().min(1).max(99).optional(),
        availability:  z.string().max(200).optional(),
        postalAddress: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const contact = await ctx.db.emergencyContact.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({ action: 'CREATE', entity: 'EmergencyContact', entityId: residentId, summary: `Contacto añadido: ${rest.name}` });
      return contact;
    }),

  addAllergy: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:  z.string(),
        substance:   z.string().min(1).max(120),
        severity:    z.nativeEnum(AllergySeverity).optional(),
        reaction:    z.string().max(300).optional(),
        allergyType: z.nativeEnum(AllergyType).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const allergy = await ctx.db.allergy.create({ data: { ...rest, residentId, tenantId: ctx.tenantId } });
      await ctx.audit({ action: 'CREATE', entity: 'Allergy', entityId: residentId, summary: `Alergia registrada: ${rest.substance}${rest.allergyType ? ` (${rest.allergyType})` : ''}` });
      return allergy;
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
      const diagnosis = await ctx.db.diagnosis.create({ data: { ...rest, residentId, tenantId: ctx.tenantId } });
      await ctx.audit({ action: 'CREATE', entity: 'Diagnosis', entityId: residentId, summary: `Diagnóstico: ${rest.description}` });
      return diagnosis;
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
      const assessment = await ctx.db.assessment.create({
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
      await ctx.audit({ action: 'CREATE', entity: 'Assessment', entityId: input.residentId, summary: `Valoración ${input.type}: ${input.score}` });
      return assessment;
    }),
});
