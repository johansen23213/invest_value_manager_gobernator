/**
 * models.ts — Registro de modelos por proveedor, resuelto por entorno.
 *
 * El copiloto razona en *tiers semánticos* (qué necesita la tarea), no en ids de
 * modelo concretos. Este módulo traduce `tier → id de modelo` según el proveedor
 * activo, leyendo la configuración del entorno. Así la elección de modelo es
 * reversible y configurable sin tocar código (ver ADR-0010).
 *
 * Principio: NO hardcodear ids a ciegas. Los defaults aquí son candidatos razonables
 * y documentados, pero SIEMPRE sobrescribibles por env. En local, sin red ni GPU, el
 * proveedor por defecto es `stub`.
 */

/** Proveedores soportados (un adaptador `ModelProvider` por cada uno). */
export const PROVIDERS = ['stub', 'vllm', 'bedrock', 'vertex'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/**
 * Tiers semánticos de modelo:
 * - `extraction`: tareas baratas y acotadas (frase→`CareRecord`, clasificación).
 * - `reasoning`: tareas que requieren más capacidad (borrador de PIA, síntesis).
 */
export const MODEL_TIERS = ['extraction', 'reasoning'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Subconjunto del entorno que necesitamos; facilita tests puros sin `process.env`. */
export type ModelEnv = Record<string, string | undefined>;

/**
 * Defaults por proveedor y tier. Son CANDIDATOS (ADR-0010), no decisiones cerradas:
 * - vLLM: modelos open-weight servidos en la UE (Mistral/Mixtral, Qwen…).
 * - bedrock/vertex: Claude-UE como fallback de razonamiento.
 * - stub: ids ficticios deterministas; nunca tocan red.
 *
 * Todos se pueden sobrescribir con variables de entorno (ver `resolveModel`).
 */
const DEFAULT_MODELS: Record<ProviderId, Record<ModelTier, string>> = {
  stub: {
    extraction: 'stub-extraction',
    reasoning: 'stub-reasoning',
  },
  vllm: {
    // Candidatos open-weight EU; el id real depende de qué se sirva en vLLM/TGI.
    extraction: 'mistral-7b-instruct',
    reasoning: 'mixtral-8x7b-instruct',
  },
  bedrock: {
    // Fallback gestionado Claude-UE (Fráncfort). Id concreto ligado a A-003.
    extraction: 'eu.anthropic.claude-haiku-placeholder',
    reasoning: 'eu.anthropic.claude-sonnet-placeholder',
  },
  vertex: {
    // Fallback gestionado Claude-UE (endpoint EU). Id concreto ligado a A-003.
    extraction: 'claude-haiku-placeholder',
    reasoning: 'claude-sonnet-placeholder',
  },
};

/** Proveedor por defecto cuando no hay config: stub (sin red, determinista). */
export const DEFAULT_PROVIDER: ProviderId = 'stub';

/** Comprueba si un string es un `ProviderId` válido. */
export function isProviderId(value: string | undefined): value is ProviderId {
  return value !== undefined && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resuelve el proveedor activo desde el entorno (`AI_PROVIDER`). Si no está fijado o
 * es inválido, cae a `stub`. Función pura: el entorno se pasa explícitamente.
 */
export function resolveProvider(env: ModelEnv = {}): ProviderId {
  const raw = env.AI_PROVIDER;
  return isProviderId(raw) ? raw : DEFAULT_PROVIDER;
}

/**
 * Convención de variables de entorno por tier y proveedor. La más específica gana:
 *   AI_MODEL_<PROVIDER>_<TIER>  (p. ej. AI_MODEL_VLLM_REASONING)
 *   AI_MODEL_<TIER>             (p. ej. AI_MODEL_REASONING)  — independiente de proveedor
 *   default del registro
 */
function envKeysFor(provider: ProviderId, tier: ModelTier): [string, string] {
  const TIER = tier.toUpperCase();
  return [`AI_MODEL_${provider.toUpperCase()}_${TIER}`, `AI_MODEL_${TIER}`];
}

/**
 * Resuelve el id de modelo para un `tier`, según el proveedor activo y el entorno.
 *
 * Orden de precedencia (de mayor a menor):
 * 1. `AI_MODEL_<PROVIDER>_<TIER>`
 * 2. `AI_MODEL_<TIER>`
 * 3. default del registro para (proveedor, tier)
 *
 * Función PURA y testeable: no lee `process.env` directamente.
 */
export function resolveModel(tier: ModelTier, env: ModelEnv = {}): string {
  const provider = resolveProvider(env);
  const [specificKey, genericKey] = envKeysFor(provider, tier);

  const specific = env[specificKey]?.trim();
  if (specific) return specific;

  const generic = env[genericKey]?.trim();
  if (generic) return generic;

  return DEFAULT_MODELS[provider][tier];
}

/** Devuelve el mapa completo `tier → id` para el proveedor activo (útil para trazas). */
export function resolveModelMap(env: ModelEnv = {}): Record<ModelTier, string> {
  return {
    extraction: resolveModel('extraction', env),
    reasoning: resolveModel('reasoning', env),
  };
}
