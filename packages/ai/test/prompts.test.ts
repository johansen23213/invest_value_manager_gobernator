import { describe, expect, it } from 'vitest';
import {
  PROMPT_TEMPLATES,
  careRecordExtractionV2,
  carePlanDraftV2,
  getSystemPrompt,
  resolveLocale,
} from '../src/prompts';

describe('resolveLocale', () => {
  it('normaliza variantes a es/ca y cae a es por defecto', () => {
    expect(resolveLocale('ca-ES')).toBe('ca-ES');
    expect(resolveLocale('ca')).toBe('ca-ES');
    expect(resolveLocale('es-ES')).toBe('es-ES');
    expect(resolveLocale('en-US')).toBe('es-ES');
    expect(resolveLocale(undefined)).toBe('es-ES');
  });
});

describe('plantillas versionadas', () => {
  it('tienen id con versión y ambos locales', () => {
    expect(careRecordExtractionV2.id).toBe('careRecordExtraction.v2');
    expect(carePlanDraftV2.id).toBe('carePlanDraft.v2');
    for (const t of Object.values(PROMPT_TEMPLATES)) {
      expect(t.system['es-ES']).toBeTruthy();
      expect(t.system['ca-ES']).toBeTruthy();
    }
  });

  it('incluyen la consigna humano-en-el-bucle en ambos idiomas', () => {
    expect(getSystemPrompt(carePlanDraftV2, 'es-ES')).toContain('confirma');
    expect(getSystemPrompt(carePlanDraftV2, 'ca-ES')).toContain('confirma');
  });

  it('getSystemPrompt selecciona por locale', () => {
    expect(getSystemPrompt(careRecordExtractionV2, 'ca')).toContain('residència');
    expect(getSystemPrompt(careRecordExtractionV2, 'es')).toContain('residencia');
  });
});
