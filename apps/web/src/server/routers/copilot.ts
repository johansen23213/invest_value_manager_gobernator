import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createProvider } from '@vetlla/ai';
import { applyCareRecordPush } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import {
  CopilotDraftError,
  careDraftSchema,
  draftToCareRecord,
  generateCareDraft,
} from '@/lib/copilot';

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
});
