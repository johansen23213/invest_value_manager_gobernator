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
import { ProviderConfigError } from './errors';

export { StubProvider } from './stub';
export { VllmProvider } from './vllm';
export { BedrockProvider } from './bedrock';
export { VertexProvider } from './vertex';
export { NotImplementedError, ProviderConfigError, ProviderRequestError } from './errors';
export type { VllmProviderConfig } from './vllm';

/**
 * Dominios públicos conocidos de proveedores NO-UE. Si `AI_VLLM_BASE_URL` apunta a
 * uno de estos dominios, rechazamos en arranque para prevenir fuga de datos de salud
 * fuera de la UE (art. 44+ RGPD).
 *
 * Criterio: endpoints SaaS públicos cuyo DPA/procesamiento es claramente fuera de la
 * UE por defecto. Los endpoints UE de los mismos proveedores (cuando existan) deben
 * configurarse explícitamente con una URL diferente y quedarán fuera de esta lista.
 */
const NON_EU_PUBLIC_ENDPOINTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com', // Gemini global
  'api.cohere.ai',
  'api.mistral.ai', // mistral.ai global (no la UE/Scaleway)
];

/**
 * Valida que la URL del proveedor vLLM no apunte a un endpoint público no-UE conocido.
 * Permite:
 *   - localhost / 127.0.0.1 / ::1  (desarrollo local, Ollama)
 *   - IPs privadas (10.x, 172.16-31.x, 192.168.x) — infra EU-soberana propia
 *   - Dominios *.eu, *.ovh.net, *.scaleway.* (UE-soberanos conocidos)
 *   - Cualquier otro dominio personalizado (el operador es responsable)
 * Rechaza:
 *   - Dominios de la lista NON_EU_PUBLIC_ENDPOINTS (fuga obvia)
 *
 * Objetivo: prevenir la fuga obvia por misconfiguration, no construir una allowlist
 * exhaustiva. La responsabilidad final de garantizar la residencia UE es del operador.
 */
export function assertEuEndpoint(rawUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    // URL inválida: la dejamos pasar aquí; el VllmProvider lanzará error al usarla.
    return;
  }

  // Permitir explícitamente endpoints locales/privados (Ollama, infra propia).
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    // IPs privadas RFC-1918.
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  ) {
    return;
  }

  // Rechazar dominios públicos no-UE conocidos.
  for (const blocked of NON_EU_PUBLIC_ENDPOINTS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      throw new ProviderConfigError(
        'vllm',
        `AI_VLLM_BASE_URL apunta a un endpoint público no-UE conocido ("${hostname}"). ` +
          'Los datos de salud de los residentes no pueden salir de la UE (art. 44+ RGPD). ' +
          'Configura un endpoint EU-soberano (OVHcloud Gravelines, Scaleway Paris, vLLM propio en UE) ' +
          'o Ollama local para desarrollo. Ver ADR-0010.',
      );
    }
  }
}

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
      // Validación de región UE: falla rápido si la URL apunta a un endpoint
      // público no-UE conocido (art. 44+ RGPD, ADR-0010).
      if (env.AI_VLLM_BASE_URL) {
        assertEuEndpoint(env.AI_VLLM_BASE_URL);
      }
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
