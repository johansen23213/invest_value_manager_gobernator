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

/**
 * Extracción determinista frente→`CareRecord` (feature 1, demo/test).
 * Reglas mínimas por palabras clave; suficiente para validar el flujo sin modelo.
 */
function deriveCareRecord(text: string): { type: string; payload: Record<string, unknown> } {
  const lower = text.toLowerCase();
  if (lower.includes('tensión') || lower.includes('tension') || lower.includes('temperatura')) {
    const tempMatch = text.match(/(\d{2}(?:[.,]\d)?)\s*º?\s?c/i);
    const tempValue = tempMatch?.[1];
    return {
      type: 'CONSTANTES',
      payload: tempValue ? { temperature: Number(tempValue.replace(',', '.')) } : { note: text },
    };
  }
  if (lower.includes('deposici')) {
    return { type: 'DEPOSICION', payload: { note: text } };
  }
  if (lower.includes('comió') || lower.includes('comio') || lower.includes('ingesta')) {
    return { type: 'INGESTA', payload: { note: text } };
  }
  if (lower.includes('caíd') || lower.includes('caid') || lower.includes('incidencia')) {
    return { type: 'INCIDENCIA', payload: { note: text } };
  }
  return { type: 'ABVD', payload: { note: text } };
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
