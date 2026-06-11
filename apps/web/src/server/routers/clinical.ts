/**
 * Router clínico — Fase 1 del expediente sociosanitario ampliado.
 *
 * Cubre las tablas nuevas de Fase 1:
 *   - ResidentDevice (dispositivos)
 *   - Vaccine (vacunas)
 *   - WeightRecord (peso)
 *   - PressureUlcer + UPPCuring (UPP y curas)
 *   - FallRecord (caídas)
 *   - Restraint (sujeciones — MUY REGULADO, siempre auditado)
 *   - ConsentRecord (consentimientos RGPD/clínicos)
 *   - LifeStory (historia de vida)
 *
 * Permisos:
 *   - Lectura: 'residents:read'
 *   - Escritura clínica general: 'clinical:write'
 *   - Sujeciones y consentimientos: 'clinical:write' + AuditLog obligatorio en
 *     cada acción (creación, finalización, revisión periódica).
 *
 * Integridad cross-residente: igual que medications.prescribe, se verifica que
 * el recurso referenciado (UPP, restraint) pertenece al mismo residente.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  ConsentType,
  DeviceType,
  RestraintType,
  UPPOrigin,
  AllergyType,
  type TenantPrisma,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { calculateBmi, isNortonHighRisk, isBradenRisk } from '@/lib/scales';

/** Verifica que el residente existe en el tenant (vía RLS) o lanza NOT_FOUND. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({ where: { id: residentId } });
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
}

/** Verifica que una UPP existe y pertenece al residente indicado. */
async function assertUlcer(db: TenantPrisma, pressureUlcerId: string, residentId: string) {
  const ulcer = await db.pressureUlcer.findUnique({ where: { id: pressureUlcerId } });
  if (!ulcer || ulcer.residentId !== residentId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'La UPP no pertenece a este residente.' });
  }
  return ulcer;
}

export const clinicalRouter = createTRPCRouter({

  // ---------------------------------------------------------------------------
  // Dispositivos
  // ---------------------------------------------------------------------------

  listDevices: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.residentDevice.findMany({
        where: { residentId: input.residentId },
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      }),
    ),

  addDevice: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:  z.string(),
        type:        z.nativeEnum(DeviceType),
        description: z.string().max(300).optional(),
        since:       z.coerce.date().optional(),
        notes:       z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const device = await ctx.db.residentDevice.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'ResidentDevice',
        entityId: residentId,
        summary: `Dispositivo añadido: ${input.type}${input.description ? ` — ${input.description}` : ''}`,
      });
      return device;
    }),

  /** Retirar/inactivar un dispositivo (no se borra, queda en historial). */
  retireDevice: permissionProcedure('clinical:write')
    .input(z.object({ id: z.string(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.db.residentDevice.update({
        where: { id: input.id },
        data: { active: false, notes: input.notes ?? undefined },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'ResidentDevice',
        entityId: device.residentId,
        summary: `Dispositivo retirado: ${device.type}`,
      });
      return device;
    }),

  // ---------------------------------------------------------------------------
  // Vacunas
  // ---------------------------------------------------------------------------

  listVaccines: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.vaccine.findMany({
        where: { residentId: input.residentId },
        orderBy: { date: 'desc' },
      }),
    ),

  addVaccine: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        type:       z.string().min(1).max(80),
        date:       z.coerce.date(),
        lot:        z.string().max(80).optional(),
        notes:      z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const vaccine = await ctx.db.vaccine.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'Vaccine',
        entityId: residentId,
        summary: `Vacuna registrada: ${input.type}${input.lot ? ` (lote ${input.lot})` : ''}`,
      });
      return vaccine;
    }),

  // ---------------------------------------------------------------------------
  // Registro de peso
  // ---------------------------------------------------------------------------

  listWeights: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.weightRecord.findMany({
        where: { residentId: input.residentId },
        orderBy: { recordedAt: 'desc' },
      }),
    ),

  addWeight: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        weightKg:   z.number().positive().max(300),
        heightCm:   z.number().positive().max(250).optional(),
        recordedAt: z.coerce.date(),
        notes:      z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, weightKg, heightCm, recordedAt, notes } = input;
      // Calcular BMI si tenemos altura
      const bmi = heightCm ? calculateBmi(weightKg, heightCm) : undefined;
      const weight = await ctx.db.weightRecord.create({
        data: {
          tenantId: ctx.tenantId,
          residentId,
          weightKg,
          heightCm,
          bmi,
          recordedAt,
          recordedById: ctx.session.user.id,
          notes,
        },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'WeightRecord',
        entityId: residentId,
        summary: `Peso registrado: ${weightKg} kg${bmi ? ` (IMC ${bmi})` : ''}`,
      });
      return weight;
    }),

  // ---------------------------------------------------------------------------
  // UPP (Úlceras por Presión)
  // ---------------------------------------------------------------------------

  listPressureUlcers: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.pressureUlcer.findMany({
        where: { residentId: input.residentId },
        orderBy: [{ active: 'desc' }, { onsetDate: 'desc' }],
        include: { curings: { orderBy: { date: 'desc' } } },
      }),
    ),

  addPressureUlcer: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:  z.string(),
        location:    z.string().min(1).max(120),
        stage:       z.number().int().min(1).max(4),
        onsetDate:   z.coerce.date(),
        acquired:    z.nativeEnum(UPPOrigin),
        notes:       z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const ulcer = await ctx.db.pressureUlcer.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'PressureUlcer',
        entityId: residentId,
        summary: `UPP registrada: ${input.location}, estadio ${input.stage}, origen ${input.acquired}`,
        metadata: { stage: input.stage, acquired: input.acquired },
      });
      return ulcer;
    }),

  resolveUlcer: permissionProcedure('clinical:write')
    .input(
      z.object({
        id:           z.string(),
        residentId:   z.string(),
        resolvedDate: z.coerce.date(),
        notes:        z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUlcer(ctx.db, input.id, input.residentId);
      const ulcer = await ctx.db.pressureUlcer.update({
        where: { id: input.id },
        data: { active: false, resolvedDate: input.resolvedDate, notes: input.notes ?? undefined },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'PressureUlcer',
        entityId: input.residentId,
        summary: `UPP resuelta: ${ulcer.location} (estadio ${ulcer.stage})`,
      });
      return ulcer;
    }),

  addCuring: permissionProcedure('clinical:write')
    .input(
      z.object({
        pressureUlcerId: z.string(),
        residentId:      z.string(),
        date:            z.coerce.date(),
        treatment:       z.string().min(1).max(500),
        evolution:       z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertUlcer(ctx.db, input.pressureUlcerId, input.residentId);
      const { pressureUlcerId, residentId, ...rest } = input;
      const curing = await ctx.db.uPPCuring.create({
        data: {
          ...rest,
          pressureUlcerId,
          tenantId: ctx.tenantId,
          doneById: ctx.session.user.id,
        },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'UPPCuring',
        entityId: residentId,
        summary: `Cura de UPP registrada: ${input.treatment}${input.evolution ? ` — ${input.evolution}` : ''}`,
      });
      return curing;
    }),

  // ---------------------------------------------------------------------------
  // Caídas
  // ---------------------------------------------------------------------------

  listFalls: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.fallRecord.findMany({
        where: { residentId: input.residentId },
        orderBy: { occurredAt: 'desc' },
      }),
    ),

  addFall: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:    z.string(),
        occurredAt:    z.coerce.date(),
        location:      z.string().max(120).optional(),
        circumstances: z.string().max(500).optional(),
        injuries:      z.string().max(500).optional(),
        witnessed:     z.boolean().optional(),
        measures:      z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const fall = await ctx.db.fallRecord.create({
        data: {
          ...rest,
          residentId,
          tenantId: ctx.tenantId,
          reportedById: ctx.session.user.id,
        },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'FallRecord',
        entityId: residentId,
        summary: `Caída registrada${input.location ? ` en ${input.location}` : ''}${input.injuries ? ` — lesiones: ${input.injuries}` : ' — sin lesiones'}`,
        metadata: { witnessed: input.witnessed, injuries: input.injuries },
      });
      return fall;
    }),

  // ---------------------------------------------------------------------------
  // Sujeciones mecánicas — MUY REGULADO (Ley 41/2002 + jurisprudencia)
  // AUDITORÍA OBLIGATORIA en creación, finalización y revisión periódica.
  // ---------------------------------------------------------------------------

  listRestraints: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.restraint.findMany({
        where: { residentId: input.residentId },
        orderBy: [{ active: 'desc' }, { prescribedAt: 'desc' }],
      }),
    ),

  /**
   * Prescribir una sujeción.
   * Campos obligatorios por protocolo legal:
   *   - justification (motivo clínico)
   *   - prescribedById (sanitario que prescribe)
   *   - prescribedAt (fecha de prescripción)
   * El consentimiento puede llegar después (campo opcional con fecha y quién firma).
   */
  addRestraint: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:      z.string(),
        type:            z.nativeEnum(RestraintType),
        justification:   z.string().min(10).max(1000), // mínimo 10 chars para evitar entradas vacías
        prescribedAt:    z.coerce.date(),
        consentObtained: z.boolean().optional(),
        consentDate:     z.coerce.date().optional(),
        consentBy:       z.string().max(120).optional(),
        notes:           z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const restraint = await ctx.db.restraint.create({
        data: {
          ...rest,
          residentId,
          tenantId: ctx.tenantId,
          prescribedById: ctx.session.user.id,
        },
      });
      // Sujeciones: auditoría siempre, con todos los detalles legales relevantes.
      await ctx.audit({
        action: 'CREATE',
        entity: 'Restraint',
        entityId: residentId,
        summary: `Sujeción prescrita: ${input.type} — ${input.justification.slice(0, 100)}`,
        metadata: {
          type: input.type,
          prescribedAt: input.prescribedAt.toISOString(),
          consentObtained: input.consentObtained ?? false,
          consentBy: input.consentBy,
        },
      });
      return restraint;
    }),

  /** Finalizar una sujeción activa (retirada). */
  endRestraint: permissionProcedure('clinical:write')
    .input(
      z.object({
        id:         z.string(),
        residentId: z.string(),
        endDate:    z.coerce.date(),
        endReason:  z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.restraint.findUnique({ where: { id: input.id } });
      if (!existing || existing.residentId !== input.residentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sujeción no pertenece a este residente.' });
      }
      const restraint = await ctx.db.restraint.update({
        where: { id: input.id },
        data: { active: false, endDate: input.endDate, endReason: input.endReason },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'Restraint',
        entityId: input.residentId,
        summary: `Sujeción finalizada: ${existing.type} — ${input.endReason}`,
        metadata: { endDate: input.endDate.toISOString(), endReason: input.endReason },
      });
      return restraint;
    }),

  /** Registrar revisión periódica de una sujeción activa (obligatorio por protocolo). */
  reviewRestraint: permissionProcedure('clinical:write')
    .input(
      z.object({
        id:         z.string(),
        residentId: z.string(),
        notes:      z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.restraint.findUnique({ where: { id: input.id } });
      if (!existing || existing.residentId !== input.residentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sujeción no pertenece a este residente.' });
      }
      const now = new Date();
      const restraint = await ctx.db.restraint.update({
        where: { id: input.id },
        data: { reviewedAt: now, notes: input.notes },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'Restraint',
        entityId: input.residentId,
        summary: `Revisión periódica de sujeción: ${existing.type} — ${input.notes.slice(0, 100)}`,
        metadata: { reviewedAt: now.toISOString(), type: existing.type },
      });
      return restraint;
    }),

  // ---------------------------------------------------------------------------
  // Consentimientos RGPD/clínicos
  // AUDITORÍA OBLIGATORIA (art. 7 RGPD — demostrar consentimiento y su retirada).
  // ---------------------------------------------------------------------------

  listConsents: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.consentRecord.findMany({
        where: { residentId: input.residentId },
        orderBy: { date: 'desc' },
      }),
    ),

  addConsent: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId: z.string(),
        type:       z.nativeEnum(ConsentType),
        granted:    z.boolean(),
        grantedBy:  z.string().max(120).optional(),
        date:       z.coerce.date(),
        notes:      z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      const consent = await ctx.db.consentRecord.create({
        data: { ...rest, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'ConsentRecord',
        entityId: residentId,
        summary: `Consentimiento ${input.granted ? 'otorgado' : 'revocado'}: ${input.type}${input.grantedBy ? ` por ${input.grantedBy}` : ''}`,
        metadata: { type: input.type, granted: input.granted, date: input.date.toISOString() },
      });
      return consent;
    }),

  // ---------------------------------------------------------------------------
  // Historia de vida (upsert — 1:1 con el residente)
  // ---------------------------------------------------------------------------

  getLifeStory: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.lifeStory.findUnique({ where: { residentId: input.residentId } }),
    ),

  upsertLifeStory: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:      z.string(),
        profession:      z.string().max(200).optional(),
        hobbies:         z.string().max(1000).optional(),
        music:           z.string().max(500).optional(),
        importantPeople: z.string().max(1000).optional(),
        religion:        z.string().max(500).optional(),
        preferences:     z.string().max(1000).optional(),
        notes:           z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...data } = input;
      const story = await ctx.db.lifeStory.upsert({
        where: { residentId },
        update: data,
        create: { ...data, residentId, tenantId: ctx.tenantId },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'LifeStory',
        entityId: residentId,
        summary: 'Historia de vida actualizada',
      });
      return story;
    }),

  // ---------------------------------------------------------------------------
  // Escalas: addAssessment ampliado con lógica Norton/Braden → alerta UPP
  // (Se expone aquí para cohesión clínica; el router residents.addAssessment
  //  también funciona pero no tiene la lógica de alerta)
  // ---------------------------------------------------------------------------

  addAssessmentWithAlert: permissionProcedure('clinical:write')
    .input(
      z.object({
        residentId:  z.string(),
        type:        z.enum(['NORTON', 'BRADEN']),
        score:       z.number().int(),
        assessedAt:  z.coerce.date().optional(),
        notes:       z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);

      // Validar rango
      const ranges = { NORTON: { min: 5, max: 20 }, BRADEN: { min: 6, max: 23 } } as const;
      const { min, max } = ranges[input.type];
      if (input.score < min || input.score > max) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Puntuación fuera de rango para ${input.type} (${min}–${max}).`,
        });
      }

      const assessment = await ctx.db.assessment.create({
        data: {
          tenantId: ctx.tenantId,
          residentId: input.residentId,
          type: input.type,
          score: input.score,
          notes: input.notes,
          assessedAt: input.assessedAt ?? new Date(),
          assessedById: ctx.session.user.id,
        },
      });

      const highRisk =
        input.type === 'NORTON' ? isNortonHighRisk(input.score) : isBradenRisk(input.score);

      await ctx.audit({
        action: 'CREATE',
        entity: 'Assessment',
        entityId: input.residentId,
        summary: `Valoración ${input.type}: ${input.score}${highRisk ? ' — ALERTA: riesgo alto de UPP' : ''}`,
        metadata: { type: input.type, score: input.score, uppRisk: highRisk },
      });

      return { assessment, uppRiskAlert: highRisk };
    }),

  // ---------------------------------------------------------------------------
  // Allergy: actualizar tipo de alergia (retrocompatible — campo opcional añadido)
  // ---------------------------------------------------------------------------

  setAllergyType: permissionProcedure('clinical:write')
    .input(
      z.object({
        allergyId:   z.string(),
        allergyType: z.nativeEnum(AllergyType),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allergy = await ctx.db.allergy.update({
        where: { id: input.allergyId },
        data: { allergyType: input.allergyType },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'Allergy',
        entityId: allergy.residentId,
        summary: `Tipo de alergia actualizado: ${allergy.substance} → ${input.allergyType}`,
      });
      return allergy;
    }),
});
