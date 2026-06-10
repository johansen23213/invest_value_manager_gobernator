/**
 * vllm.ts — Adaptador para CUALQUIER endpoint OpenAI-compatible de Chat Completions.
 *
 * Sirve tal cual para los dos escenarios de la estrategia open-weight soberana UE
 * (ADR-0010 / ADR-0011):
 *   1. **vLLM/TGI self-host** sobre GPU en cloud EU-soberano (Hetzner, OVHcloud A100…).
 *   2. **Inferencia gestionada open-weight UE** que expone API OpenAI-compatible:
 *      **OVHcloud AI Endpoints** (Gravelines, FR) y **Scaleway Generative APIs** (FR).
 * En ambos casos la configuración es la misma: una base URL y (opcional) una API key,
 * inyectadas por entorno (`AI_VLLM_BASE_URL` / `AI_VLLM_API_KEY`). No añade SDKs: usa el
 * `fetch` global de Node 20+ contra `POST {baseUrl}/chat/completions`.
 *
 * Garantías de la capa (CLAUDE.md): el modelo NUNCA toca la BD, solo emite `toolCalls`;
 * nunca se registran secretos (la cabecera Authorization no se vuelca en errores).
 */

import type {
  CompletionInput,
  CompletionResult,
  Message,
  ModelProvider,
  StopReason,
  ToolCall,
  ToolDefinition,
} from '../provider';
import { resolveModel, type ModelEnv, type ModelTier } from '../models';
import { ProviderConfigError, ProviderRequestError } from './errors';

/** Timeout por defecto de una completion (ms). Sobrescribible con `AI_VLLM_TIMEOUT_MS`. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Tier por defecto cuando la entrada no trae ni `model` ni `tier`. */
const DEFAULT_TIER: ModelTier = 'reasoning';

export interface VllmProviderConfig {
  /** Base URL del endpoint OpenAI-compatible, p. ej. https://oai.endpoints.kepler.ai.cloud.ovh.net/v1 */
  baseUrl?: string;
  /** API key si el gateway la exige (puede ir vacía en self-host sin auth). */
  apiKey?: string;
  /** Entorno para resolver el id de modelo por tier (mismo registro que el resto). */
  env?: ModelEnv;
  /** Timeout de la petición en ms (default ~60s). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Tipos de la respuesta OpenAI Chat Completions (solo lo que consumimos).
// ---------------------------------------------------------------------------

interface OpenAiToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChoiceMessage {
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}

interface OpenAiChoice {
  message?: OpenAiChoiceMessage;
  finish_reason?: string | null;
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenAiChatResponse {
  model?: string;
  choices?: OpenAiChoice[];
  usage?: OpenAiUsage;
}

// ---------------------------------------------------------------------------
// Mapeos contrato Vetlla ↔ OpenAI.
// ---------------------------------------------------------------------------

/** Normaliza la base URL quitando barras finales (el baseUrl ya suele incluir `/v1`). */
function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/** Mensajes Vetlla → mensajes OpenAI, con el `system` como primer turno. */
function toOpenAiMessages(
  system: string,
  messages: Message[],
): { role: string; content: string }[] {
  return [{ role: 'system', content: system }, ...messages];
}

/** ToolDefinition[] → bloque `tools` en formato function-calling de OpenAI. */
function toOpenAiTools(
  tools: ToolDefinition[],
): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

/**
 * `responseFormat` Vetlla → `response_format` OpenAI. Si trae un JSON Schema usamos
 * `json_schema` (soportado por endpoints recientes); si no, el genérico `json_object`.
 */
function toOpenAiResponseFormat(
  responseFormat: CompletionInput['responseFormat'],
): Record<string, unknown> | undefined {
  if (!responseFormat || responseFormat.type !== 'json') return undefined;
  if (responseFormat.schema) {
    return {
      type: 'json_schema',
      json_schema: { name: 'response', schema: responseFormat.schema, strict: true },
    };
  }
  return { type: 'json_object' };
}

/** finish_reason OpenAI → StopReason Vetlla. Cualquier otro valor cae a 'end'. */
function toStopReason(finishReason: string | null | undefined): StopReason {
  switch (finishReason) {
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'stop':
    default:
      return 'end';
  }
}

/** Parsea las tool_calls OpenAI → ToolCall[] Vetlla, con `input` ya deserializado. */
function parseToolCalls(raw: OpenAiToolCall[] | undefined): ToolCall[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((call, index) => {
    const name = call.function?.name;
    if (!name) {
      throw new ProviderRequestError('vllm', `tool_call sin nombre en la respuesta (índice ${index})`);
    }
    const argsText = call.function?.arguments ?? '{}';
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = argsText.trim() === '' ? {} : JSON.parse(argsText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('los argumentos no son un objeto JSON');
      }
      input = parsed as Record<string, unknown>;
    } catch (err) {
      throw new ProviderRequestError(
        'vllm',
        `argumentos de la tool_call "${name}" no son JSON válido`,
        { cause: err },
      );
    }
    return { id: call.id ?? `call_${index}`, name, input };
  });
}

/** Recorta un cuerpo de error para incluirlo en mensajes sin volcar respuestas enormes. */
function truncateBody(body: string, max = 500): string {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

// ---------------------------------------------------------------------------
// Adaptador.
// ---------------------------------------------------------------------------

/** Adaptador OpenAI-compatible (vLLM self-host o gestionado UE OVHcloud/Scaleway). */
export class VllmProvider implements ModelProvider {
  readonly id = 'vllm';

  constructor(private readonly config: VllmProviderConfig = {}) {}

  /** Resuelve el id de modelo: `input.model` explícito > tier+env > tier por defecto. */
  private resolveModelId(input: CompletionInput): string {
    if (input.model) return input.model;
    const tier = input.tier ?? DEFAULT_TIER;
    return resolveModel(tier, this.config.env ?? {});
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const baseUrl = this.config.baseUrl?.trim();
    if (!baseUrl) {
      throw new ProviderConfigError('vllm', 'falta la base URL del endpoint (AI_VLLM_BASE_URL)');
    }

    const model = this.resolveModelId(input);
    const url = chatCompletionsUrl(baseUrl);

    const body: Record<string, unknown> = {
      model,
      messages: toOpenAiMessages(input.system, input.messages),
      max_tokens: input.maxTokens,
    };
    if (input.temperature !== undefined) body.temperature = input.temperature;
    const responseFormat = toOpenAiResponseFormat(input.responseFormat);
    if (responseFormat) body.response_format = responseFormat;
    if (input.tools && input.tools.length > 0) body.tools = toOpenAiTools(input.tools);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new ProviderRequestError(
        'vllm',
        aborted ? `la petición excedió el timeout de ${timeoutMs}ms` : 'fallo de red al contactar el endpoint',
        { cause: err },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderRequestError(
        'vllm',
        `respuesta HTTP ${response.status}: ${truncateBody(text)}`,
        { status: response.status },
      );
    }

    let data: OpenAiChatResponse;
    try {
      data = (await response.json()) as OpenAiChatResponse;
    } catch (err) {
      throw new ProviderRequestError('vllm', 'la respuesta no es JSON válido', { cause: err });
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderRequestError('vllm', 'la respuesta no contiene ninguna choice');
    }

    return {
      text: choice.message?.content ?? '',
      toolCalls: parseToolCalls(choice.message?.tool_calls),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      stopReason: toStopReason(choice.finish_reason),
      model: data.model ?? model,
    };
  }
}
