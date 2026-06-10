/**
 * copilot.ts — Lógica pura de la Feature 1 del copiloto (H5 Slice 2):
 * lenguaje natural → borrador de `CareRecord` estructurado, con humano confirmando.
 *
 * Garantías que materializa este módulo (ADR-0010, CLAUDE.md):
 * - Minimización PII: el utterance se seudonimiza (`redactPii`) ANTES de llegar al
 *   provider; la salida se rehidrata al volver. El modelo solo ve tokens.
 * - El modelo NUNCA toca la BD: aquí solo se valida JSON con Zod y se transforma a
 *   un borrador. La persistencia ocurre en el router tRPC tras confirmación humana.
 * - Funciones puras/testables sin servidor ni BD (el provider se inyecta; en tests
 *   y en local es el `StubProvider` determinista).
 */

import { z } from 'zod';
import {
  careRecordExtractionV1,
  getSystemPrompt,
  redactPii,
  rehydrate,
  type ModelProvider,
  type PiiMapEntry,
} from '@vetlla/ai';
import type { CareRecordType, FieldValue, IncomingCareRecord, Payload } from '@vetlla/db';

// ---------------------------------------------------------------------------
// Esquema Zod del borrador (validación de la salida del modelo y del confirm)
// ---------------------------------------------------------------------------

/** Número flexible: acepta string con coma decimal (es/ca) y coerciona. */
const flexibleNumber = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v),
  z.number().finite(),
);

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Al menos un campo del payload debe llegar con valor (un borrador vacío no aporta). */
function atLeastOneField(payload: Record<string, unknown>): boolean {
  return Object.values(payload).some((v) => v !== undefined && v !== null && v !== '');
}

const constantesPayload = z
  .object({
    tension: optionalText(20),
    fc: flexibleNumber.pipe(z.number().min(20).max(250)).optional(),
    temperatura: flexibleNumber.pipe(z.number().min(30).max(45)).optional(),
    sato2: flexibleNumber.pipe(z.number().min(40).max(100)).optional(),
    nota: optionalText(500),
  })
  .refine(atLeastOneField, { message: 'El borrador de constantes no tiene ningún valor.' });

const abvdPayload = z
  .object({ actividad: optionalText(120), nota: optionalText(500) })
  .refine(atLeastOneField, { message: 'El borrador de ABVD no tiene ningún valor.' });

const deposicionPayload = z
  .object({ deposicion: optionalText(10), notas: optionalText(500) })
  .refine(atLeastOneField, { message: 'El borrador de deposición no tiene ningún valor.' });

const ingestaPayload = z
  .object({
    comida: optionalText(40),
    porcentaje: flexibleNumber.pipe(z.number().min(0).max(100)).optional(),
    nota: optionalText(500),
  })
  .refine(atLeastOneField, { message: 'El borrador de ingesta no tiene ningún valor.' });

const incidenciaPayload = z.object({
  descripcion: z.string().trim().min(1).max(1000),
});

const noteField = optionalText(1000);

/**
 * Borrador de `CareRecord` propuesto por el copiloto: tipo + payload según tipo +
 * nota opcional del modelo. Es el contrato entre modelo ↔ servidor ↔ UI de revisión.
 */
export const careDraftSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONSTANTES'), payload: constantesPayload, note: noteField }),
  z.object({ type: z.literal('ABVD'), payload: abvdPayload, note: noteField }),
  z.object({ type: z.literal('DEPOSICION'), payload: deposicionPayload, note: noteField }),
  z.object({ type: z.literal('INGESTA'), payload: ingestaPayload, note: noteField }),
  z.object({ type: z.literal('INCIDENCIA'), payload: incidenciaPayload, note: noteField }),
]);

export type CareDraft = z.infer<typeof careDraftSchema>;

/** Campos editables por tipo (orden de presentación en la tarjeta de borrador). */
export const CARE_DRAFT_FIELDS: Record<CareRecordType, readonly string[]> = {
  CONSTANTES: ['tension', 'fc', 'temperatura', 'sato2', 'nota'],
  ABVD: ['actividad', 'nota'],
  DEPOSICION: ['deposicion', 'notas'],
  INGESTA: ['comida', 'porcentaje', 'nota'],
  INCIDENCIA: ['descripcion'],
};

// ---------------------------------------------------------------------------
// Parseo de la salida del modelo
// ---------------------------------------------------------------------------

/** El modelo devolvió algo que no es un borrador válido (JSON roto o fuera de esquema). */
export class CopilotDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotDraftError';
  }
}

/** Parsea y valida el texto JSON devuelto por el modelo. Lanza `CopilotDraftError`. */
export function parseCareDraft(text: string): CareDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CopilotDraftError('La salida del modelo no es JSON válido.');
  }
  const parsed = careDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CopilotDraftError(
      `La salida del modelo no cumple el esquema de borrador: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** Rehidrata los tokens PII ([[PERSONA_1]]…) en los campos de texto del borrador. */
export function rehydrateDraft(draft: CareDraft, map: PiiMapEntry[]): CareDraft {
  if (map.length === 0) return draft;
  const payload = Object.fromEntries(
    Object.entries(draft.payload).map(([k, v]) => [
      k,
      typeof v === 'string' ? rehydrate(v, map) : v,
    ]),
  );
  return {
    ...draft,
    payload,
    note: draft.note === undefined ? undefined : rehydrate(draft.note, map),
  } as CareDraft;
}

// ---------------------------------------------------------------------------
// Generación del borrador (provider inyectado; sin BD)
// ---------------------------------------------------------------------------

export interface GenerateCareDraftInput {
  /** Texto libre del auxiliar ("ha comido la mitad"…). */
  utterance: string;
  /** Identificadores conocidos del residente (nombre/apellidos) a seudonimizar. */
  knownNames?: string[];
  /** Locale del usuario ('es' | 'ca'); selecciona la plantilla de prompt. */
  locale?: string;
}

export interface GenerateCareDraftResult {
  draft: CareDraft;
  /** Id de modelo usado (trazabilidad → AuditLog). */
  model: string;
  /** Versión de la plantilla de prompt (trazabilidad → AuditLog). */
  promptVersion: string;
  /** Utterance seudonimizado, lo ÚNICO que vio el modelo (trazable sin PII). */
  redactedUtterance: string;
}

/**
 * Genera un borrador de `CareRecord` a partir de texto libre.
 * Minimiza PII antes de llamar al provider y rehidrata la salida validada.
 * NO persiste nada: el resultado vuelve a la UI para que un humano lo confirme.
 */
export async function generateCareDraft(
  provider: ModelProvider,
  input: GenerateCareDraftInput,
): Promise<GenerateCareDraftResult> {
  const { redacted, map } = redactPii(input.utterance, { names: input.knownNames });
  const result = await provider.complete({
    system: getSystemPrompt(careRecordExtractionV1, input.locale),
    messages: [{ role: 'user', content: redacted }],
    tier: 'extraction',
    maxTokens: 512,
    temperature: 0,
    responseFormat: { type: 'json' },
  });
  const draft = parseCareDraft(result.text);
  return {
    draft: rehydrateDraft(draft, map),
    model: result.model,
    promptVersion: careRecordExtractionV1.id,
    redactedUtterance: redacted,
  };
}

// ---------------------------------------------------------------------------
// Borrador confirmado → registro de atención (reutiliza el flujo de care.push)
// ---------------------------------------------------------------------------

/**
 * Convierte un borrador confirmado al `IncomingCareRecord` que consume
 * `applyCareRecordPush` (misma lógica idempotente que `care.push`).
 */
export function draftToCareRecord(
  draft: CareDraft,
  args: { residentId: string; clientId: string; recordedAt?: Date },
): IncomingCareRecord {
  const recordedAt = args.recordedAt ?? new Date();
  const now = recordedAt.toISOString();
  const payload: Payload = {};
  const fieldTimestamps: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft.payload)) {
    if (value === undefined || value === '') continue;
    payload[key] = value as FieldValue;
    fieldTimestamps[key] = now;
  }
  return {
    clientId: args.clientId,
    residentId: args.residentId,
    type: draft.type,
    recordedAt,
    payload,
    fieldTimestamps,
  };
}
