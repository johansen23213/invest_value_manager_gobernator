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
  carePlanDraftV1,
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

// ===========================================================================
// Feature 2 (H5 Slice 3) — Borrador de PIA/PAI con confirmación humana
// ===========================================================================
//
// Mismo patrón draft→confirm que la Feature 1, pero con el tier `reasoning` y sobre
// el PIA. El modelo recibe un RESUMEN MINIMIZADO del expediente (dependencia, escalas,
// diagnósticos, alergias — sin PII directa: nombres/contactos seudonimizados con
// `redactPii`) y devuelve un JSON con título + objetivos. NO persiste nada: el borrador
// vuelve a la UI para que un profesional (SANITARIO/DIRECTOR) lo revise y confirme.

/** Objetivo de un borrador de PIA: descripción + fecha objetivo opcional (ISO). */
const carePlanGoalSchema = z.object({
  description: z.string().trim().min(1).max(300),
  targetDate: z.string().trim().min(1).optional(),
});

/**
 * Borrador de PIA propuesto por el copiloto: título + 1..10 objetivos + notas
 * opcionales. Es el contrato modelo ↔ servidor ↔ UI de revisión (Feature 2).
 */
export const carePlanDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  goals: z.array(carePlanGoalSchema).min(1).max(10),
  notes: z.string().trim().max(2000).optional(),
});

export type CarePlanDraft = z.infer<typeof carePlanDraftSchema>;

/** Parsea y valida el JSON del modelo para un PIA. Lanza `CopilotDraftError`. */
export function parseCarePlanDraft(text: string): CarePlanDraft {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CopilotDraftError('La salida del modelo no es JSON válido.');
  }
  const parsed = carePlanDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CopilotDraftError(
      `La salida del modelo no cumple el esquema de PIA: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** Rehidrata los tokens PII en los campos de texto del borrador de PIA. */
export function rehydrateCarePlanDraft(draft: CarePlanDraft, map: PiiMapEntry[]): CarePlanDraft {
  if (map.length === 0) return draft;
  return {
    title: rehydrate(draft.title, map),
    goals: draft.goals.map((g) => ({ ...g, description: rehydrate(g.description, map) })),
    notes: draft.notes === undefined ? undefined : rehydrate(draft.notes, map),
  };
}

// ---------------------------------------------------------------------------
// Resumen minimizado del expediente (lo ÚNICO que ve el modelo)
// ---------------------------------------------------------------------------

/**
 * Expediente del residente tal como lo compone el router (lecturas vía ctx/RLS).
 * Contiene SOLO los datos clínicos relevantes para el PIA; los identificadores
 * directos (nombre/apellidos/contactos) se seudonimizan antes de salir al modelo.
 */
export interface ResidentDossier {
  /** Nombre/apellidos conocidos a seudonimizar (nunca llegan crudos al modelo). */
  knownNames?: string[];
  dependencyGrade?: string | null;
  /** Escalas: tipo (BARTHEL/TINETTI) + puntuación + fecha opcional. */
  assessments?: { type: string; score: number; assessedAt?: string }[];
  diagnoses?: { description: string; code?: string | null }[];
  allergies?: { substance: string; severity?: string | null }[];
  /** Indicaciones libres que el profesional escribe para guiar el borrador. */
  guidance?: string;
}

/** Mapa de etiquetas legibles para el grado de dependencia (entra en el resumen). */
const DEPENDENCY_LABELS: Record<string, string> = {
  SIN_VALORAR: 'sin valorar',
  GRADO_I: 'grado I',
  GRADO_II: 'grado II',
  GRADO_III: 'grado III',
};

/**
 * Construye el resumen textual minimizado del expediente que se manda al modelo.
 * Función pura: solo concatena datos clínicos en frases es; NO incluye PII directa
 * (el seudonimizado se aplica después con `redactPii` sobre `guidance` y nombres).
 */
export function buildDossierSummary(dossier: ResidentDossier): string {
  const lines: string[] = [];

  if (dossier.dependencyGrade) {
    const label = DEPENDENCY_LABELS[dossier.dependencyGrade] ?? dossier.dependencyGrade;
    lines.push(`Dependencia: ${label}.`);
  }

  if (dossier.assessments && dossier.assessments.length > 0) {
    const scales = dossier.assessments.map((a) => `${a.type} ${a.score}`).join(', ');
    lines.push(`Escalas: ${scales}.`);
  }

  if (dossier.diagnoses && dossier.diagnoses.length > 0) {
    const dx = dossier.diagnoses
      .map((d) => (d.code ? `${d.description} (${d.code})` : d.description))
      .join('; ');
    lines.push(`Diagnósticos: ${dx}.`);
  }

  if (dossier.allergies && dossier.allergies.length > 0) {
    const al = dossier.allergies
      .map((a) => (a.severity ? `${a.substance} (${a.severity})` : a.substance))
      .join('; ');
    lines.push(`Alergias: ${al}.`);
  }

  if (dossier.guidance && dossier.guidance.trim() !== '') {
    lines.push(`Indicaciones del profesional: ${dossier.guidance.trim()}`);
  }

  if (lines.length === 0) {
    lines.push('Sin datos clínicos relevantes registrados en el expediente.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generación del borrador de PIA (provider inyectado; sin BD)
// ---------------------------------------------------------------------------

export interface GenerateCarePlanDraftInput {
  dossier: ResidentDossier;
  /** Locale del usuario ('es' | 'ca'); selecciona la plantilla de prompt. */
  locale?: string;
}

export interface GenerateCarePlanDraftResult {
  draft: CarePlanDraft;
  /** Id de modelo usado (trazabilidad → AuditLog). */
  model: string;
  /** Versión de la plantilla de prompt (trazabilidad → AuditLog). */
  promptVersion: string;
  /** Resumen seudonimizado, lo ÚNICO que vio el modelo (trazable sin PII). */
  redactedSummary: string;
}

/**
 * Genera un borrador de PIA a partir del expediente minimizado del residente.
 * Minimiza PII (seudonimiza nombres/contactos y cualquier identificador directo en el
 * resumen) ANTES de llamar al provider (tier `reasoning`, JSON) y rehidrata la salida
 * validada. NO persiste nada: el resultado vuelve a la UI para confirmación humana.
 */
export async function generateCarePlanDraft(
  provider: ModelProvider,
  input: GenerateCarePlanDraftInput,
): Promise<GenerateCarePlanDraftResult> {
  const summary = buildDossierSummary(input.dossier);
  // Minimización PII: seudonimiza nombres conocidos + identificadores estructurados
  // (DNI/NIE, teléfono, email) que pudieran colarse en diagnósticos/indicaciones.
  const { redacted, map } = redactPii(summary, { names: input.dossier.knownNames });

  const result = await provider.complete({
    system: getSystemPrompt(carePlanDraftV1, input.locale),
    messages: [{ role: 'user', content: redacted }],
    tier: 'reasoning',
    maxTokens: 1024,
    temperature: 0,
    responseFormat: { type: 'json' },
  });

  const draft = parseCarePlanDraft(result.text);
  return {
    draft: rehydrateCarePlanDraft(draft, map),
    model: result.model,
    promptVersion: carePlanDraftV1.id,
    redactedSummary: redacted,
  };
}
