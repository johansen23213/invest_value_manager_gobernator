/**
 * provider.ts — El corazón provider-agnóstico de `@vetlla/ai`.
 *
 * Define la interfaz `ModelProvider`, que abstrae el motor de modelo (open-source
 * auto-alojado en la UE, Claude-UE como fallback, o el `StubProvider` determinista
 * para dev/tests). Toda la capa de IA del producto se apoya en esta interfaz, de modo
 * que la elección de modelo es reversible y se puede mezclar por tarea (ver ADR-0010).
 *
 * Principios materializados aquí (CLAUDE.md):
 * - El modelo NUNCA toca la BD: solo emite `toolCalls`; quien ejecuta es la app.
 * - Humano siempre en el bucle: el bucle de tool-use no persiste nada; deja al
 *   llamante decidir qué herramientas ejecutar y cuándo parar para que un humano
 *   confirme.
 */

/** Roles de turno en una conversación. El rol `system` se pasa aparte. */
export type MessageRole = 'user' | 'assistant';

/** Un turno de conversación. El contenido es texto plano en este slice. */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Definición de una herramienta que el modelo puede invocar. El `inputSchema` es un
 * JSON Schema (derivado de Zod en `tools.ts`). El proveedor lo traduce al formato
 * nativo del motor al cablearse.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema del input de la herramienta. */
  inputSchema: Record<string, unknown>;
}

/** Una invocación de herramienta emitida por el modelo. */
export interface ToolCall {
  /** Id único de la llamada, para casar la respuesta (tool_result) con la petición. */
  id: string;
  name: string;
  /** Argumentos ya parseados (el proveedor garantiza objeto, no string JSON crudo). */
  input: Record<string, unknown>;
}

/** Formato de respuesta solicitado: texto libre o JSON conforme a un esquema. */
export type ResponseFormat =
  | { type: 'text' }
  | { type: 'json'; schema?: Record<string, unknown> };

/** Opciones de inferencia comunes a todos los proveedores. */
export interface CompletionOptions {
  /** Tier semántico ('extraction' | 'reasoning'); el proveedor lo resuelve a un id. */
  tier?: ModelTier;
  /** Id de modelo explícito (sobrescribe el resuelto por tier). */
  model?: string;
  maxTokens: number;
  temperature?: number;
  responseFormat?: ResponseFormat;
}

/** Entrada de una completion. */
export interface CompletionInput extends CompletionOptions {
  /** Instrucción de sistema (no es un turno; se pasa aparte como en la mayoría de APIs). */
  system: string;
  messages: Message[];
  tools?: ToolDefinition[];
}

/** Contabilidad de tokens (best-effort; el stub la simula). */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Por qué terminó la generación. */
export type StopReason = 'end' | 'tool_use' | 'max_tokens';

/** Resultado tipado de una completion. */
export interface CompletionResult {
  /** Texto generado (puede ser '' si el turno fue solo tool-use). */
  text: string;
  /** Herramientas que el modelo quiere invocar (vacío si no hay). */
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
  /** Id de modelo efectivamente usado, para trazabilidad/AuditLog. */
  model: string;
}

/** Tiers semánticos de modelo (ver `models.ts`). */
export type ModelTier = 'extraction' | 'reasoning';

/**
 * Interfaz que todo motor de modelo implementa. Mantenerla mínima y estable: los
 * adaptadores (stub, vLLM, Bedrock, Vertex) viven detrás de ella.
 */
export interface ModelProvider {
  /** Identificador del proveedor, p. ej. 'stub' | 'vllm' | 'bedrock' | 'vertex'. */
  readonly id: string;
  /** Una completion (sin streaming en este slice). */
  complete(input: CompletionInput): Promise<CompletionResult>;
}

/**
 * Resultado de ejecutar una herramienta, devuelto al modelo en el siguiente turno.
 * `isError: true` permite al modelo reaccionar a fallos de validación/permisos.
 */
export interface ToolResult {
  toolCallId: string;
  /** Contenido serializable que se devuelve al modelo (se serializa a JSON/texto). */
  content: unknown;
  isError?: boolean;
}

/**
 * Ejecutor de herramientas que provee el llamante (la app). Recibe la llamada del
 * modelo y devuelve el resultado. AQUÍ es donde, al cablearse a tRPC, se validan
 * rol/tenant/RLS y donde un humano confirma antes de persistir. El provider no sabe
 * nada de la BD.
 */
export type ToolExecutor = (call: ToolCall) => Promise<ToolResult>;

/** Opciones del bucle de tool-use. */
export interface ToolUseLoopOptions {
  /** Tope de iteraciones para evitar bucles infinitos. */
  maxIterations?: number;
  /**
   * Gancho humano-en-el-bucle: se invoca antes de ejecutar cada lote de toolCalls.
   * Si devuelve `false`, el bucle se detiene SIN ejecutar (el humano no confirmó).
   * Por defecto se ejecutan (en tests/dev); en producción la UI conecta aquí la
   * confirmación.
   */
  confirmToolCalls?: (calls: ToolCall[]) => boolean | Promise<boolean>;
}

/** Resultado final del bucle de tool-use. */
export interface ToolUseLoopResult {
  /** Resultado de la última completion del modelo. */
  final: CompletionResult;
  /** Historial completo de mensajes (incluye los tool_result inyectados como turnos). */
  messages: Message[];
  /** Nº de iteraciones (completions) realizadas. */
  iterations: number;
  /** True si se paró porque `confirmToolCalls` devolvió false. */
  stoppedForConfirmation: boolean;
  /** Toda la contabilidad de tokens agregada. */
  usage: Usage;
}

/**
 * Bucle de tool-use manual y human-in-the-loop friendly.
 *
 * Itera: pide una completion → si el modelo emite toolCalls, (opcionalmente pide
 * confirmación), las ejecuta vía `execute`, inyecta los resultados como un nuevo
 * turno y repite. Termina cuando el modelo deja de pedir herramientas, se agotan las
 * iteraciones, o el humano no confirma.
 *
 * NO persiste nada por sí mismo: toda escritura ocurre dentro de `execute`, que es
 * responsabilidad del llamante (y donde se aplican permisos/tenant/RLS/confirmación).
 */
export async function runToolUseLoop(
  provider: ModelProvider,
  input: CompletionInput,
  execute: ToolExecutor,
  options: ToolUseLoopOptions = {},
): Promise<ToolUseLoopResult> {
  const maxIterations = options.maxIterations ?? 8;
  const messages: Message[] = [...input.messages];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };

  let iterations = 0;
  let final: CompletionResult | undefined;

  while (iterations < maxIterations) {
    iterations += 1;
    final = await provider.complete({ ...input, messages });
    usage.inputTokens += final.usage.inputTokens;
    usage.outputTokens += final.usage.outputTokens;

    if (final.toolCalls.length === 0) {
      return { final, messages, iterations, stoppedForConfirmation: false, usage };
    }

    // Punto humano-en-el-bucle: confirmar antes de ejecutar herramientas.
    if (options.confirmToolCalls) {
      const ok = await options.confirmToolCalls(final.toolCalls);
      if (!ok) {
        return { final, messages, iterations, stoppedForConfirmation: true, usage };
      }
    }

    // El turno del asistente (texto + intención de tool-use) queda registrado.
    messages.push({ role: 'assistant', content: serializeAssistantTurn(final) });

    // Ejecutar herramientas e inyectar resultados como un turno de usuario.
    const results: ToolResult[] = [];
    for (const call of final.toolCalls) {
      results.push(await execute(call));
    }
    messages.push({ role: 'user', content: serializeToolResults(results) });
  }

  // Se agotaron las iteraciones; `final` está definido porque maxIterations >= 1.
  if (!final) {
    throw new Error('runToolUseLoop: maxIterations debe ser >= 1');
  }
  return { final, messages, iterations, stoppedForConfirmation: false, usage };
}

/** Serializa el turno del asistente a texto para mantenerlo en el historial. */
function serializeAssistantTurn(result: CompletionResult): string {
  const parts: string[] = [];
  if (result.text) parts.push(result.text);
  for (const call of result.toolCalls) {
    parts.push(`[tool_use:${call.name}#${call.id}] ${JSON.stringify(call.input)}`);
  }
  return parts.join('\n');
}

/** Serializa los resultados de herramientas a texto para el siguiente turno. */
function serializeToolResults(results: ToolResult[]): string {
  return results
    .map(
      (r) =>
        `[tool_result#${r.toolCallId}${r.isError ? ':error' : ''}] ${JSON.stringify(r.content)}`,
    )
    .join('\n');
}
