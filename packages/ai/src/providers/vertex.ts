/**
 * vertex.ts — Adaptador para Claude vía Google Vertex AI (endpoint UE).
 * ESQUELETO del Slice 1: implementa la interfaz pero NO realiza inferencia (ADR-0010).
 *
 * Rol: alternativa de FALLBACK gestionado Claude-UE (junto a Bedrock). Misma interfaz.
 *
 * TODO(Slice 3+): cablear vía API Vertex (Anthropic on Vertex) SOLO si se usa el
 * fallback gestionado. Garantizar location EU (p. ej. europe-west*). DPA/SCC.
 */

import type { CompletionInput, CompletionResult, ModelProvider } from '../provider';
import { NotImplementedError } from './errors';

export interface VertexProviderConfig {
  /** GCP project id. */
  projectId?: string;
  /** Location; debe ser UE (p. ej. europe-west1). */
  location?: string;
}

/** Adaptador Claude-UE vía Vertex. NO funcional en Slice 1. */
export class VertexProvider implements ModelProvider {
  readonly id = 'vertex';

  constructor(private readonly config: VertexProviderConfig = {}) {}

  complete(_input: CompletionInput): Promise<CompletionResult> {
    // TODO(Slice 3+): generateContent vía API Vertex, location EU obligatoria.
    const missing = !this.config.projectId || !this.config.location;
    throw new NotImplementedError(
      'vertex',
      missing
        ? 'falta projectId/location EU (AI_VERTEX_PROJECT/AI_VERTEX_LOCATION)'
        : 'cliente Vertex pendiente de cablear',
    );
  }
}
