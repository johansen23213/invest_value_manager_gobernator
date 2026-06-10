/**
 * stub.ts — `StubProvider` determinista (sin red, sin GPU, sin clave).
 *
 * Es el proveedor por defecto en local (`AI_PROVIDER=stub` o sin config). Implementa
 * `ModelProvider` con respuestas DETERMINISTAS derivadas por reglas simples del input,
 * de modo que las features 1 (frase→`CareRecord`) y 2 (borrador de PIA) se pueden
 * desarrollar y testear sin ningún modelo real (ADR-0010, Slice 1).
 *
 * Comportamiento (todo predecible para tests):
 * - Si se pasan `tools` y el último turno del usuario sugiere una acción, emite una
 *   `toolCall` predecible (extracción de `CareRecord` o propuesta de PIA).
 * - Una vez recibe un `tool_result` en el historial, deja de pedir herramientas y
 *   responde con un texto de confirmación → el bucle de tool-use termina.
 * - Si `responseFormat` es JSON, devuelve un objeto estructurado por reglas.
 * - `usage` se simula de forma estable (proporcional a la longitud del input).
 */

import type {
  CompletionInput,
  CompletionResult,
  Message,
  ModelProvider,
  ToolCall,
} from '../provider';
import { resolveModel } from '../models';

export interface StubProviderOptions {
  /** Entorno para resolver el id de modelo a reportar (trazabilidad). */
  env?: Record<string, string | undefined>;
}

/** Usage simulada de forma estable: ~1 token cada 4 caracteres. */
function estimateUsage(input: CompletionInput): { inputTokens: number; outputTokens: number } {
  const inputChars =
    input.system.length + input.messages.reduce((acc, m) => acc + m.content.length, 0);
  return { inputTokens: Math.ceil(inputChars / 4), outputTokens: 16 };
}

function lastUserMessage(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user') return m.content;
  }
  return '';
}

/** ¿El historial ya contiene un resultado de herramienta? (lo serializa el bucle). */
function hasToolResult(messages: Message[]): boolean {
  return messages.some((m) => m.content.includes('[tool_result'));
}

/** ¿El texto (en minúsculas) contiene alguna de las palabras clave? */
function matchesAny(lower: string, keywords: string[]): boolean {
  return keywords.some((k) => lower.includes(k));
}

// Palabras clave es/ca por tipo de registro. El texto puede llegar seudonimizado
// (tokens [[PERSONA_1]]…), por eso solo se buscan términos clínicos, nunca nombres.
const VITALS_KEYWORDS = ['tensión', 'tensió', 'tension', 'temperatura', 'constantes', 'constants', 'saturaci', 'pulso', 'pols', 'lpm'];
const INCIDENT_KEYWORDS = ['caíd', 'caid', 'caigut', 'caigud', 'incidencia', 'incidència', 'incident', 'golpe', 'cop al', 'herida', 'ferida', 'agitad', 'agitat'];
const STOOL_KEYWORDS = ['deposici', 'femta'];
const INTAKE_KEYWORDS = ['comid', 'comió', 'comio', 'menjat', 'menjar', 'ingesta', 'ingerit', 'desayun', 'esmorza', 'merienda', 'berenar', 'cena', 'sopar', 'bebid', 'begut'];

/** Deriva constantes medibles del texto (tensión, temperatura, FC, SatO₂). */
function deriveVitals(text: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const tension = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (tension) payload.tension = `${tension[1]}/${tension[2]}`;
  const temp = text.match(/(\d{2}(?:[.,]\d)?)\s*(?:º|°)?\s?c\b/i);
  if (temp?.[1]) payload.temperatura = Number(temp[1].replace(',', '.'));
  const fc = text.match(/(\d{2,3})\s*(?:lpm|ppm)/i);
  if (fc?.[1]) payload.fc = Number(fc[1]);
  const sat = text.match(/sat\w*[^\d]{0,4}(\d{2,3})/i);
  if (sat?.[1]) payload.sato2 = Number(sat[1]);
  return Object.keys(payload).length > 0 ? payload : { nota: text };
}

/** Deriva la ingesta: comida del día + porcentaje aproximado por expresión. */
function deriveIntake(text: string, lower: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (matchesAny(lower, ['desayun', 'esmorza'])) payload.comida = 'Desayuno';
  else if (matchesAny(lower, ['merienda', 'berenar'])) payload.comida = 'Merienda';
  else if (matchesAny(lower, ['cena', 'sopar', 'sopat'])) payload.comida = 'Cena';
  else if (matchesAny(lower, ['comida', 'dinar'])) payload.comida = 'Comida';
  if (matchesAny(lower, ['todo', 'tot', 'completa', 'completo'])) payload.porcentaje = 100;
  else if (matchesAny(lower, ['tres cuartos', 'tres quarts'])) payload.porcentaje = 75;
  else if (matchesAny(lower, ['mitad', 'meitat'])) payload.porcentaje = 50;
  else if (matchesAny(lower, ['poco', 'poc ', 'un cuarto', 'un quart'])) payload.porcentaje = 25;
  else if (matchesAny(lower, ['nada', 'res ', 'rechaz', 'rebutj'])) payload.porcentaje = 0;
  payload.nota = text;
  return payload;
}

/**
 * Extracción determinista frase→`CareRecord` (feature 1, demo/test).
 * Reglas por palabras clave es/ca y campos derivados coherentes con los payloads
 * que registra la UI de atención (tension/fc/temperatura/sato2, comida/porcentaje,
 * deposicion/notas, descripcion). Suficiente para validar el flujo sin modelo.
 */
function deriveCareRecord(text: string): { type: string; payload: Record<string, unknown> } {
  const lower = text.toLowerCase();
  if (matchesAny(lower, VITALS_KEYWORDS)) {
    return { type: 'CONSTANTES', payload: deriveVitals(text) };
  }
  if (matchesAny(lower, INCIDENT_KEYWORDS)) {
    return { type: 'INCIDENCIA', payload: { descripcion: text } };
  }
  if (matchesAny(lower, STOOL_KEYWORDS)) {
    const negated = matchesAny(lower, ['no ha', 'sin deposici', 'sense deposici', 'no hay']);
    return { type: 'DEPOSICION', payload: { deposicion: negated ? 'No' : 'Sí', notas: text } };
  }
  if (matchesAny(lower, INTAKE_KEYWORDS)) {
    return { type: 'INGESTA', payload: deriveIntake(text, lower) };
  }
  return { type: 'ABVD', payload: { nota: text } };
}

/** Genera la toolCall que el stub emite según el input. `id` estable por iteración. */
function planToolCall(input: CompletionInput): ToolCall | undefined {
  if (!input.tools || input.tools.length === 0) return undefined;
  const text = lastUserMessage(input.messages);
  if (!text) return undefined;

  const toolNames = new Set(input.tools.map((t) => t.name));
  const lower = text.toLowerCase();

  // Feature 2: borrador de PIA.
  if ((lower.includes('pia') || lower.includes('plan')) && toolNames.has('proposeCarePlan')) {
    return {
      id: 'stub-call-1',
      name: 'proposeCarePlan',
      input: {
        residentId: 'stub-resident',
        title: 'Borrador de PIA (stub)',
        goals: [{ description: 'Objetivo de ejemplo derivado del stub' }],
      },
    };
  }

  // Feature 1: frase → CareRecord.
  if (toolNames.has('proposeCareRecord')) {
    const { type, payload } = deriveCareRecord(text);
    return {
      id: 'stub-call-1',
      name: 'proposeCareRecord',
      input: { residentId: 'stub-resident', type, payload, sourceText: text },
    };
  }

  return undefined;
}

/**
 * Proveedor de modelo determinista para dev/tests. No realiza ninguna llamada de red.
 */
export class StubProvider implements ModelProvider {
  readonly id = 'stub';
  private readonly env: Record<string, string | undefined>;

  constructor(options: StubProviderOptions = {}) {
    this.env = { ...options.env, AI_PROVIDER: 'stub' };
  }

  complete(input: CompletionInput): Promise<CompletionResult> {
    const tier = input.tier ?? 'extraction';
    const model = input.model ?? resolveModel(tier, this.env);
    const usage = estimateUsage(input);

    // Si ya ejecutamos una herramienta, cerramos con texto (el bucle termina).
    if (hasToolResult(input.messages)) {
      return Promise.resolve({
        text: 'Propuesta preparada. Revísala y confirma para guardar (humano en el bucle).',
        toolCalls: [],
        usage,
        stopReason: 'end',
        model,
      });
    }

    // Salida estructurada JSON solicitada: devolvemos un objeto derivado por reglas.
    if (input.responseFormat?.type === 'json') {
      const record = deriveCareRecord(lastUserMessage(input.messages));
      return Promise.resolve({
        text: JSON.stringify(record),
        toolCalls: [],
        usage,
        stopReason: 'end',
        model,
      });
    }

    // ¿Toca pedir una herramienta?
    const call = planToolCall(input);
    if (call) {
      return Promise.resolve({
        text: '',
        toolCalls: [call],
        usage,
        stopReason: 'tool_use',
        model,
      });
    }

    // Por defecto: eco resumido determinista.
    return Promise.resolve({
      text: `stub: ${lastUserMessage(input.messages).slice(0, 80)}`,
      toolCalls: [],
      usage,
      stopReason: 'end',
      model,
    });
  }
}
