/**
 * providers/index.ts — Fábrica de proveedores resuelta por entorno.
 *
 * Devuelve la implementación de `ModelProvider` según `AI_PROVIDER`. Por defecto (sin
 * config, o `AI_PROVIDER=stub`) devuelve el `StubProvider` determinista → dev/tests
 * sin red. Los adaptadores reales son esqueletos en el Slice 1 (lanzan al usarse).
 */

import type { ModelProvider } from '../provider';
import { resolveProvider, type ModelEnv } from '../models';
import { StubProvider } from './stub';
import { VllmProvider } from './vllm';
import { BedrockProvider } from './bedrock';
import { VertexProvider } from './vertex';

export { StubProvider } from './stub';
export { VllmProvider } from './vllm';
export { BedrockProvider } from './bedrock';
export { VertexProvider } from './vertex';
export { NotImplementedError, ProviderConfigError, ProviderRequestError } from './errors';
export type { VllmProviderConfig } from './vllm';

/**
 * Crea el `ModelProvider` activo según el entorno. Función central que la app usa para
 * obtener "el modelo" sin saber cuál es. En local cae a `StubProvider`.
 */
export function createProvider(env: ModelEnv = {}): ModelProvider {
  const id = resolveProvider(env);
  switch (id) {
    case 'stub':
      return new StubProvider({ env });
    case 'vllm': {
      const timeoutRaw = env.AI_VLLM_TIMEOUT_MS?.trim();
      const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
      return new VllmProvider({
        baseUrl: env.AI_VLLM_BASE_URL,
        apiKey: env.AI_VLLM_API_KEY,
        env,
        timeoutMs: timeoutMs !== undefined && Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      });
    }
    case 'bedrock':
      return new BedrockProvider({ region: env.AI_BEDROCK_REGION });
    case 'vertex':
      return new VertexProvider({
        projectId: env.AI_VERTEX_PROJECT,
        location: env.AI_VERTEX_LOCATION,
      });
  }
}
