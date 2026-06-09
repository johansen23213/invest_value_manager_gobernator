import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDER,
  isProviderId,
  resolveModel,
  resolveModelMap,
  resolveProvider,
} from '../src/models';

describe('resolveProvider', () => {
  it('cae a stub sin config', () => {
    expect(resolveProvider({})).toBe('stub');
    expect(DEFAULT_PROVIDER).toBe('stub');
  });

  it('cae a stub si AI_PROVIDER es inválido', () => {
    expect(resolveProvider({ AI_PROVIDER: 'no-existe' })).toBe('stub');
  });

  it('respeta un proveedor válido', () => {
    expect(resolveProvider({ AI_PROVIDER: 'vllm' })).toBe('vllm');
    expect(resolveProvider({ AI_PROVIDER: 'bedrock' })).toBe('bedrock');
  });
});

describe('isProviderId', () => {
  it('valida ids conocidos y rechaza el resto', () => {
    expect(isProviderId('stub')).toBe(true);
    expect(isProviderId('vertex')).toBe(true);
    expect(isProviderId('openai')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

describe('resolveModel', () => {
  it('default stub por tier sin config', () => {
    expect(resolveModel('extraction', {})).toBe('stub-extraction');
    expect(resolveModel('reasoning', {})).toBe('stub-reasoning');
  });

  it('usa los defaults del proveedor activo', () => {
    expect(resolveModel('reasoning', { AI_PROVIDER: 'vllm' })).toBe('mixtral-8x7b-instruct');
    expect(resolveModel('extraction', { AI_PROVIDER: 'vllm' })).toBe('mistral-7b-instruct');
  });

  it('AI_MODEL_<TIER> genérico sobrescribe el default', () => {
    expect(resolveModel('reasoning', { AI_PROVIDER: 'vllm', AI_MODEL_REASONING: 'qwen-72b' })).toBe(
      'qwen-72b',
    );
  });

  it('AI_MODEL_<PROVIDER>_<TIER> específico gana sobre el genérico', () => {
    const env = {
      AI_PROVIDER: 'vllm',
      AI_MODEL_REASONING: 'qwen-72b',
      AI_MODEL_VLLM_REASONING: 'mixtral-custom',
    };
    expect(resolveModel('reasoning', env)).toBe('mixtral-custom');
  });

  it('ignora valores en blanco y cae al siguiente nivel', () => {
    expect(
      resolveModel('extraction', { AI_PROVIDER: 'vllm', AI_MODEL_VLLM_EXTRACTION: '  ' }),
    ).toBe('mistral-7b-instruct');
  });
});

describe('resolveModelMap', () => {
  it('devuelve el mapa completo del proveedor activo', () => {
    expect(resolveModelMap({ AI_PROVIDER: 'bedrock' })).toEqual({
      extraction: 'eu.anthropic.claude-haiku-placeholder',
      reasoning: 'eu.anthropic.claude-sonnet-placeholder',
    });
  });
});
