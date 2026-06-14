/**
 * tools.ts — Definiciones de herramientas tipadas (Zod) que el copiloto puede invocar.
 *
 * SOLO definiciones/esquemas en este slice. La EJECUCIÓN real se cablea a los
 * procedures tRPC en slices posteriores; cuando se cablee, cada herramienta validará
 * ROL, TENANT y RLS (el modelo nunca toca la BD: CLAUDE.md, ADR-0010). Aquí solo
 * fijamos el contrato de entrada para que el `StubProvider` y el bucle de tool-use
 * puedan trabajar de forma determinista y testeable.
 *
 * Convención: `get*`/`list*` son lecturas; `propose*` son ESCRITURAS-PROPUESTA — nunca
 * persisten directamente: generan un borrador que un humano confirma antes de guardar.
 */

import { z } from 'zod';
import type { ToolDefinition } from './provider';

/** Tipos de `CareRecord` soportados (espejo del enum `CareRecordType` en `@vetlla/db`). */
export const careRecordTypeSchema = z.enum([
  'CONSTANTES',
  'ABVD',
  'DEPOSICION',
  'INGESTA',
  'INCIDENCIA',
]);

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** `getResident`: lee la ficha de un residente del tenant actual. */
export const getResidentInput = z.object({
  residentId: z.string().min(1, 'residentId requerido'),
});
export type GetResidentInput = z.infer<typeof getResidentInput>;

/** `listCareRecords`: lista registros de atención de un residente, con filtros. */
export const listCareRecordsInput = z.object({
  residentId: z.string().min(1, 'residentId requerido'),
  type: careRecordTypeSchema.optional(),
  /** Rango temporal (ISO 8601) opcional. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type ListCareRecordsInput = z.infer<typeof listCareRecordsInput>;

// ---------------------------------------------------------------------------
// Escritura-propuesta (humano confirma antes de persistir)
// ---------------------------------------------------------------------------

/**
 * `proposeCareRecord`: propone un `CareRecord` estructurado (p. ej. extraído de una
 * frase del auxiliar). `payload` es libre por tipo en este slice; la validación fina
 * por tipo se afinará al cablear el procedure.
 */
export const proposeCareRecordInput = z.object({
  residentId: z.string().min(1, 'residentId requerido'),
  type: careRecordTypeSchema,
  /** Valores estructurados (varían por tipo de registro). */
  payload: z.record(z.unknown()),
  /** Momento clínico al que se refiere el registro (ISO 8601). */
  recordedAt: z.string().datetime().optional(),
  /** Texto original del que se derivó, para que el humano lo coteje. */
  sourceText: z.string().optional(),
});
export type ProposeCareRecordInput = z.infer<typeof proposeCareRecordInput>;

/** Objetivo propuesto dentro de un PIA. */
export const proposedGoalSchema = z.object({
  description: z.string().min(1),
  targetDate: z.string().datetime().optional(),
});

/**
 * `proposeCarePlan`: propone un borrador de PIA/PAI (título + objetivos) para que un
 * profesional lo revise y confirme. No crea nada por sí mismo.
 */
export const proposeCarePlanInput = z.object({
  residentId: z.string().min(1, 'residentId requerido'),
  title: z.string().min(1, 'title requerido'),
  notes: z.string().optional(),
  goals: z.array(proposedGoalSchema).default([]),
});
export type ProposeCarePlanInput = z.infer<typeof proposeCarePlanInput>;

// ---------------------------------------------------------------------------
// Registro de herramientas
// ---------------------------------------------------------------------------

/** Una herramienta del copiloto: metadatos + esquema Zod + definición para el modelo. */
export interface CopilotTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  /** 'read' no muta; 'write-proposal' genera un borrador que un humano confirma. */
  kind: 'read' | 'write-proposal';
  schema: TSchema;
}

/**
 * Convierte una herramienta a la `ToolDefinition` que consume el provider.
 *
 * DEFERIDO (IA-H02 / auditoría 2026-06-14): el `inputSchema` emite un objeto vacío
 * `{ type: 'object' }`. Para los dos flujos estrella actuales (Feature 1 y 2) esto
 * no es un problema porque ambos usan `responseFormat:json` directo, NO tool-calling
 * real — el modelo actúa como extractor, no como agente que invoca herramientas.
 *
 * Cuando se active `runToolUseLoop` real con un proveedor vLLM/Bedrock, habrá que
 * generar el JSON Schema completo desde el Zod schema. La solución es añadir
 * `zod-to-json-schema` como dependencia de `@vetlla/ai` e integrarla aquí:
 *   import { zodToJsonSchema } from 'zod-to-json-schema';
 *   inputSchema: zodToJsonSchema(tool.schema)
 * No se hace ahora para no añadir una dependencia sin un consumidor activo.
 * Registrado: TODO IA-H02 — resolver antes de activar flujos agénticos con tool-use.
 */
export function toToolDefinition(tool: CopilotTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: 'object' },
  };
}

/** Todas las herramientas del copiloto, indexadas por nombre. */
export const COPILOT_TOOLS = {
  getResident: {
    name: 'getResident',
    description:
      'Lee la ficha de un residente del tenant actual (datos básicos, dependencia). Respeta rol/tenant/RLS al ejecutarse.',
    kind: 'read',
    schema: getResidentInput,
  },
  listCareRecords: {
    name: 'listCareRecords',
    description:
      'Lista registros de atención (constantes, ABVD, deposiciones, ingesta, incidencias) de un residente. Respeta rol/tenant/RLS.',
    kind: 'read',
    schema: listCareRecordsInput,
  },
  proposeCareRecord: {
    name: 'proposeCareRecord',
    description:
      'Propone un registro de atención estructurado a partir de texto. NO persiste: genera un borrador que un humano confirma.',
    kind: 'write-proposal',
    schema: proposeCareRecordInput,
  },
  proposeCarePlan: {
    name: 'proposeCarePlan',
    description:
      'Propone un borrador de PIA/PAI (título + objetivos) para revisión profesional. NO persiste: el humano confirma.',
    kind: 'write-proposal',
    schema: proposeCarePlanInput,
  },
} satisfies Record<string, CopilotTool>;

export type CopilotToolName = keyof typeof COPILOT_TOOLS;

/** Lista de `ToolDefinition` lista para pasar a `ModelProvider.complete`. */
export function copilotToolDefinitions(): ToolDefinition[] {
  return Object.values(COPILOT_TOOLS).map((t) => toToolDefinition(t));
}

/**
 * Valida el input de una herramienta por su nombre. Lanza `ZodError` si no cumple.
 * Aquí es donde, al cablear, se rechaza una toolCall malformada antes de tocar nada.
 */
export function parseToolInput(name: CopilotToolName, input: unknown): unknown {
  return COPILOT_TOOLS[name].schema.parse(input);
}
