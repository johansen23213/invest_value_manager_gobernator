import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createProvider } from '@vetlla/ai';
import { applyCareRecordPush } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import {
  CopilotDraftError,
  careDraftSchema,
  carePlanDraftSchema,
  draftToCareRecord,
  generateCareDraft,
  generateCarePlanDraft,
  type ResidentDossier,
} from '@/lib/copilot';
import { createCarePlanWithGoals } from '@/server/services/careplans';

// Router del copiloto (H5 Slice 2 — Feature 1: lenguaje natural → CareRecord).
//
// Garantías (ADR-0010, CLAUDE.md):
// - El modelo NUNCA toca la BD: el provider solo recibe texto seudonimizado y
//   devuelve JSON; toda lectura/escritura pasa por ctx.db (RLS) + permisos RBAC.
// - Minimización PII: el utterance se redacta ANTES de llegar al provider.
// - Humano en el bucle: `draftCareRecord` no persiste nada; solo `confirmCareRecord`
//   (acción explícita del profesional) guarda, reutilizando el flujo de care.push.
// - Trazabilidad: cada acción del copiloto queda en AuditLog con modelo y versión
//   de prompt; nunca se guarda el utterance crudo, solo el seudonimizado.

export const copilotRouter = createTRPCRouter({
  /** Genera un BORRADOR de registro de atención a partir de texto libre. No persiste. */
  draftCareRecord: permissionProcedure('care:write')
    .input(
      z.object({
        residentId: z.string(),
        utterance: z.string().trim().min(1).max(1000),
        locale: z.enum(['es', 'ca']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // (a) El residente debe existir y pertenecer al tenant (consulta acotada por RLS).
      const resident = await ctx.db.resident.findUnique({ where: { id: input.residentId } });
      if (!resident) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      }

      // (b)+(c)+(d)+(e) Minimiza PII → provider (tier extraction, JSON) → valida → rehidrata.
      const provider = createProvider(process.env);
      let result;
      try {
        result = await generateCareDraft(provider, {
          utterance: input.utterance,
          knownNames: [
            `${resident.firstName} ${resident.lastName}`,
            resident.firstName,
            resident.lastName,
          ],
          locale: input.locale,
        });
      } catch (error) {
        if (error instanceof CopilotDraftError) {
          // Salida del modelo inválida: error limpio, sin guardar nada.
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
      }

      // (g) Trazabilidad RGPD/AI-Act: borrador generado (sin entityId: aún no existe).
      // metadata SIN el utterance crudo: solo la versión seudonimizada.
      await ctx.audit({
        action: 'COPILOT_DRAFT',
        entity: 'CareRecord',
        summary: `Borrador de ${result.draft.type} propuesto por el copiloto`,
        metadata: {
          residentId: input.residentId,
          model: result.model,
          promptVersion: result.promptVersion,
          locale: input.locale ?? 'es',
          utteranceRedacted: result.redactedUtterance,
        },
      });

      // (f) NO persiste nada: el borrador vuelve a la UI para confirmación humana.
      return { draft: result.draft, model: result.model, promptVersion: result.promptVersion };
    }),

  /** Persiste un borrador REVISADO Y CONFIRMADO por el profesional (humano en el bucle). */
  confirmCareRecord: permissionProcedure('care:write')
    .input(
      z.object({
        residentId: z.string(),
        /** Generado en cliente (crypto.randomUUID) → idempotencia ante reintentos. */
        clientId: z.string().uuid(),
        draft: careDraftSchema,
        model: z.string().max(120),
        promptVersion: z.string().max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Misma lógica de persistencia que care.push (idempotente por clientId, RLS).
      const record = draftToCareRecord(input.draft, {
        residentId: input.residentId,
        clientId: input.clientId,
      });
      let results;
      try {
        results = await applyCareRecordPush(ctx.db, ctx.tenantId, ctx.session.user.id, [record]);
      } catch (error) {
        // applyCareRecordPush lanza si el residente no es del tenant (RLS).
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Residente no encontrado.',
          cause: error,
        });
      }
      const saved = results[0];
      if (!saved) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo guardar.' });
      }

      await ctx.audit({
        action: 'COPILOT_CONFIRM',
        entity: 'CareRecord',
        entityId: saved.id,
        summary: `Registro de ${input.draft.type} del copiloto confirmado y guardado`,
        metadata: {
          aiSuggested: true,
          model: input.model,
          promptVersion: input.promptVersion,
          confirmedBy: ctx.session.user.email,
        },
      });

      return saved;
    }),

  // -------------------------------------------------------------------------
  // Feature 2 (H5 Slice 3) — Borrador de PIA/PAI (tier reasoning).
  // -------------------------------------------------------------------------
  //
  // Mismo patrón draft→confirm, con permiso `careplan:write` (SANITARIO/DIRECTOR;
  // el AUXILIAR NO lo tiene). El modelo recibe un RESUMEN MINIMIZADO del expediente
  // (sin PII directa: nombres/contactos seudonimizados) y devuelve un JSON validado.

  /** Genera un BORRADOR de PIA a partir del expediente minimizado. No persiste. */
  draftCarePlan: permissionProcedure('careplan:write')
    .input(
      z.object({
        residentId: z.string(),
        /** Indicaciones libres del profesional para guiar el borrador (opcional). */
        guidance: z.string().trim().max(1000).optional(),
        locale: z.enum(['es', 'ca']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // (a) El residente debe existir y pertenecer al tenant (acotado por RLS).
      const resident = await ctx.db.resident.findUnique({ where: { id: input.residentId } });
      if (!resident) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      }

      // (b) Compone el expediente MINIMIZADO con lecturas vía ctx (RLS). Solo datos
      //     clínicos relevantes para el PIA; los nombres se seudonimizan en la lib.
      const [assessments, diagnoses, allergies] = await Promise.all([
        ctx.db.assessment.findMany({
          where: { residentId: input.residentId },
          orderBy: { assessedAt: 'desc' },
          take: 6,
        }),
        ctx.db.diagnosis.findMany({ where: { residentId: input.residentId } }),
        ctx.db.allergy.findMany({ where: { residentId: input.residentId } }),
      ]);

      const dossier: ResidentDossier = {
        knownNames: [
          `${resident.firstName} ${resident.lastName}`,
          resident.firstName,
          resident.lastName,
        ],
        dependencyGrade: resident.dependencyGrade,
        assessments: assessments.map((a) => ({
          type: a.type,
          score: a.score,
          assessedAt: a.assessedAt.toISOString(),
        })),
        diagnoses: diagnoses.map((d) => ({ description: d.description, code: d.code })),
        allergies: allergies.map((a) => ({ substance: a.substance, severity: a.severity })),
        guidance: input.guidance,
      };

      // (c)+(d)+(e) Minimiza PII → provider (tier reasoning, JSON) → valida → rehidrata.
      const provider = createProvider(process.env);
      let result;
      try {
        result = await generateCarePlanDraft(provider, { dossier, locale: input.locale });
      } catch (error) {
        if (error instanceof CopilotDraftError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
      }

      // (g) Trazabilidad RGPD/AI-Act: borrador generado (sin entityId: aún no existe).
      // metadata SIN PII cruda: solo el resumen seudonimizado y la trazabilidad del modelo.
      await ctx.audit({
        action: 'COPILOT_DRAFT',
        entity: 'CarePlan',
        summary: 'Borrador de PIA propuesto por el copiloto',
        metadata: {
          residentId: input.residentId,
          model: result.model,
          promptVersion: result.promptVersion,
          locale: input.locale ?? 'es',
          summaryRedacted: result.redactedSummary,
        },
      });

      // (f) NO persiste nada: el borrador vuelve a la UI para confirmación humana.
      return { draft: result.draft, model: result.model, promptVersion: result.promptVersion };
    }),

  /** Persiste un borrador de PIA REVISADO Y CONFIRMADO por el profesional. */
  confirmCarePlan: permissionProcedure('careplan:write')
    .input(
      z.object({
        residentId: z.string(),
        draft: carePlanDraftSchema,
        model: z.string().max(120),
        promptVersion: z.string().max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Reutiliza la lógica compartida (misma que carePlans.create + addGoal).
      let plan;
      try {
        plan = await createCarePlanWithGoals(ctx.db, {
          tenantId: ctx.tenantId,
          createdById: ctx.session.user.id,
          input: {
            residentId: input.residentId,
            title: input.draft.title,
            notes: input.draft.notes,
            goals: input.draft.goals.map((g) => ({
              description: g.description,
              targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
            })),
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'RESIDENT_NOT_FOUND') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
        }
        throw error;
      }

      await ctx.audit({
        action: 'COPILOT_CONFIRM',
        entity: 'CarePlan',
        entityId: plan.id,
        summary: `PIA del copiloto confirmado y creado: ${plan.title}`,
        metadata: {
          aiSuggested: true,
          model: input.model,
          promptVersion: input.promptVersion,
          goalsCount: plan.goals.length,
          confirmedBy: ctx.session.user.email,
        },
      });

      return plan;
    }),
});
