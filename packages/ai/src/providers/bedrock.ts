/**
 * bedrock.ts — Adaptador para Claude vía AWS Bedrock (región UE, Fráncfort).
 * ESQUELETO del Slice 1: implementa la interfaz pero NO realiza inferencia (ADR-0010).
 *
 * Rol: FALLBACK gestionado para razonamiento de alta exigencia (borrador de PIA) si el
 * open-source self-host no llega en calidad. Detrás de la misma interfaz → enrutar solo
 * esa feature aquí sin reescribir nada.
 *
 * TODO(Slice 3+): cablear `@aws-sdk/client-bedrock-runtime` SOLO si se decide usar el
 * fallback (no añadir el SDK pesado mientras no se necesite). Garantizar región EU y
 * DPA/SCC. El modelo nunca toca la BD: solo emite toolCalls.
 */

import type { CompletionInput, CompletionResult, ModelProvider } from '../provider';
import { NotImplementedError } from './errors';

export interface BedrockProviderConfig {
  /** Región AWS; debe ser UE (p. ej. eu-central-1). */
  region?: string;
}

/** Adaptador Claude-UE vía Bedrock. NO funcional en Slice 1. */
export class BedrockProvider implements ModelProvider {
  readonly id = 'bedrock';

  constructor(private readonly config: BedrockProviderConfig = {}) {}

  complete(_input: CompletionInput): Promise<CompletionResult> {
    // TODO(Slice 3+): InvokeModel/Converse vía SDK Bedrock, región EU obligatoria.
    throw new NotImplementedError(
      'bedrock',
      this.config.region
        ? 'cliente Bedrock pendiente de cablear'
        : 'falta región EU (AI_BEDROCK_REGION)',
    );
  }
}
