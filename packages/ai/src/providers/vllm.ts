/**
 * vllm.ts — Adaptador para modelos open-weight self-host vía API OpenAI-compatible
 * (vLLM/TGI sobre GPU en cloud EU-soberano). ESQUELETO del Slice 1: implementa la
 * interfaz pero NO realiza inferencia todavía (ADR-0010).
 *
 * Estrategia: liderar con open-source en la UE → este es el adaptador "principal" a
 * cablear primero. No añadimos SDKs pesados aquí; cuando se cablee, bastará `fetch`
 * contra el endpoint `/v1/chat/completions` OpenAI-compatible.
 *
 * TODO(Slice 3): mapear `CompletionInput` ↔ formato OpenAI (system/messages/tools),
 * parsear `tool_calls`, traducir `responseFormat` a `response_format: json_schema`,
 * y rellenar `usage` desde la respuesta.
 */

import type { CompletionInput, CompletionResult, ModelProvider } from '../provider';
import { NotImplementedError } from './errors';

export interface VllmProviderConfig {
  /** Base URL del endpoint OpenAI-compatible, p. ej. https://gpu.eu.example/v1 */
  baseUrl?: string;
  /** API key si el gateway la exige (puede ir vacía en self-host). */
  apiKey?: string;
}

/** Adaptador OpenAI-compatible para self-host. NO funcional en Slice 1. */
export class VllmProvider implements ModelProvider {
  readonly id = 'vllm';

  constructor(private readonly config: VllmProviderConfig = {}) {}

  complete(_input: CompletionInput): Promise<CompletionResult> {
    // TODO(Slice 3): POST {baseUrl}/chat/completions con fetch; sin SDK pesado.
    throw new NotImplementedError(
      'vllm',
      this.config.baseUrl
        ? 'cliente OpenAI-compatible pendiente de cablear'
        : 'falta baseUrl (AI_VLLM_BASE_URL)',
    );
  }
}
