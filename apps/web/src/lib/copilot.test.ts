import { describe, expect, it } from 'vitest';
import { StubProvider } from '@vetlla/ai';
import {
  CARE_DRAFT_FIELDS,
  CopilotDraftError,
  careDraftSchema,
  draftToCareRecord,
  generateCareDraft,
  parseCareDraft,
  rehydrateDraft,
} from './copilot';

describe('careDraftSchema — validación del borrador', () => {
  it('acepta un borrador de CONSTANTES con valores numéricos', () => {
    const parsed = careDraftSchema.parse({
      type: 'CONSTANTES',
      payload: { tension: '120/80', temperatura: 36.5 },
    });
    expect(parsed.type).toBe('CONSTANTES');
    expect(parsed.payload).toEqual({ tension: '120/80', temperatura: 36.5 });
  });

  it('coerciona números desde string, incluida la coma decimal (es/ca)', () => {
    const parsed = careDraftSchema.parse({
      type: 'CONSTANTES',
      payload: { temperatura: '36,5', fc: '72' },
    });
    expect(parsed.payload).toEqual({ temperatura: 36.5, fc: 72 });
  });

  it('acepta INGESTA con porcentaje y descarta claves desconocidas', () => {
    const parsed = careDraftSchema.parse({
      type: 'INGESTA',
      payload: { comida: 'Comida', porcentaje: 50, inventada: 'x' },
    });
    expect(parsed.payload).toEqual({ comida: 'Comida', porcentaje: 50 });
  });

  it('rechaza un tipo desconocido', () => {
    expect(careDraftSchema.safeParse({ type: 'OTRO', payload: { nota: 'x' } }).success).toBe(false);
  });

  it('rechaza INCIDENCIA sin descripción', () => {
    expect(careDraftSchema.safeParse({ type: 'INCIDENCIA', payload: {} }).success).toBe(false);
  });

  it('rechaza un payload sin ningún valor (borrador vacío)', () => {
    expect(careDraftSchema.safeParse({ type: 'CONSTANTES', payload: {} }).success).toBe(false);
    expect(careDraftSchema.safeParse({ type: 'ABVD', payload: { nota: '' } }).success).toBe(false);
  });

  it('rechaza valores clínicos fuera de rango (temperatura, porcentaje)', () => {
    expect(
      careDraftSchema.safeParse({ type: 'CONSTANTES', payload: { temperatura: 60 } }).success,
    ).toBe(false);
    expect(
      careDraftSchema.safeParse({ type: 'INGESTA', payload: { porcentaje: 150 } }).success,
    ).toBe(false);
  });

  it('CARE_DRAFT_FIELDS (campos editables de la UI) sobrevive al parse de cada tipo', () => {
    const sampleValues: Record<string, string> = {
      tension: '120/80',
      fc: '70',
      temperatura: '36,5',
      sato2: '95',
      nota: 'nota',
      notas: 'notas',
      comida: 'Comida',
      porcentaje: '50',
      deposicion: 'Sí',
      descripcion: 'descripción',
      actividad: 'aseo',
    };
    for (const [type, fields] of Object.entries(CARE_DRAFT_FIELDS)) {
      const payload = Object.fromEntries(fields.map((f) => [f, sampleValues[f]]));
      const parsed = careDraftSchema.safeParse({ type, payload });
      expect(parsed.success, `el payload de ${type} debería ser válido`).toBe(true);
      if (parsed.success) {
        expect(Object.keys(parsed.data.payload).sort()).toEqual([...fields].sort());
      }
    }
  });
});

describe('parseCareDraft — salida del modelo', () => {
  it('parsea JSON válido conforme al esquema', () => {
    const draft = parseCareDraft('{"type":"DEPOSICION","payload":{"deposicion":"Sí"}}');
    expect(draft.type).toBe('DEPOSICION');
  });

  it('lanza CopilotDraftError con JSON roto', () => {
    expect(() => parseCareDraft('esto no es json')).toThrow(CopilotDraftError);
  });

  it('lanza CopilotDraftError con JSON fuera de esquema (no guarda nada)', () => {
    expect(() => parseCareDraft('{"type":"DIAGNOSTICO","payload":{}}')).toThrow(CopilotDraftError);
  });
});

describe('rehydrateDraft — los tokens PII vuelven a sus valores', () => {
  it('rehidrata strings del payload y la nota', () => {
    const draft = parseCareDraft(
      '{"type":"INCIDENCIA","payload":{"descripcion":"[[PERSONA_1]] se ha caído"},"note":"avisar a [[PERSONA_2]]"}',
    );
    const map = [
      { token: '[[PERSONA_1]]', value: 'María García', category: 'PERSONA' as const },
      { token: '[[PERSONA_2]]', value: 'Joan', category: 'PERSONA' as const },
    ];
    const rehydrated = rehydrateDraft(draft, map);
    expect(rehydrated.payload).toEqual({ descripcion: 'María García se ha caído' });
    expect(rehydrated.note).toBe('avisar a Joan');
  });

  it('sin mapa devuelve el borrador intacto', () => {
    const draft = parseCareDraft('{"type":"ABVD","payload":{"nota":"aseo"}}');
    expect(rehydrateDraft(draft, [])).toBe(draft);
  });
});

describe('generateCareDraft — flujo completo con StubProvider (sin red, sin BD)', () => {
  const provider = new StubProvider();

  it('"ha comido la mitad" → borrador INGESTA con porcentaje 50', async () => {
    const result = await generateCareDraft(provider, { utterance: 'ha comido la mitad' });
    expect(result.draft.type).toBe('INGESTA');
    expect(result.draft.payload).toMatchObject({ porcentaje: 50 });
    expect(result.model).toBe('stub-extraction');
    expect(result.promptVersion).toBe('careRecordExtraction.v1');
  });

  it('"tensión 120/80, 36.5ºC" → borrador CONSTANTES con tensión y temperatura', async () => {
    const result = await generateCareDraft(provider, { utterance: 'tensión 120/80, 36.5ºC' });
    expect(result.draft.type).toBe('CONSTANTES');
    expect(result.draft.payload).toMatchObject({ tension: '120/80', temperatura: 36.5 });
  });

  it('"deposición normal" → DEPOSICION; "se ha caído en el baño" → INCIDENCIA', async () => {
    const stool = await generateCareDraft(provider, { utterance: 'deposición normal' });
    expect(stool.draft.type).toBe('DEPOSICION');
    const fall = await generateCareDraft(provider, { utterance: 'se ha caído en el baño' });
    expect(fall.draft.type).toBe('INCIDENCIA');
  });

  it('minimiza PII antes del provider y rehidrata el borrador al volver', async () => {
    const result = await generateCareDraft(provider, {
      utterance: 'María García se ha caído en el baño',
      knownNames: ['María García', 'María', 'García'],
    });
    // Lo ÚNICO que vio el modelo: texto seudonimizado, sin el nombre real.
    expect(result.redactedUtterance).toBe('[[PERSONA_1]] se ha caído en el baño');
    expect(result.redactedUtterance).not.toContain('María');
    // El borrador devuelto al humano sí lleva el nombre real (rehidratado).
    expect(result.draft.type).toBe('INCIDENCIA');
    expect(result.draft.payload).toMatchObject({
      descripcion: 'María García se ha caído en el baño',
    });
  });

  it('selecciona la plantilla por locale sin romper el flujo (ca)', async () => {
    const result = await generateCareDraft(provider, {
      utterance: 'ha sopat tot el menjar',
      locale: 'ca',
    });
    expect(result.draft.type).toBe('INGESTA');
    expect(result.draft.payload).toMatchObject({ comida: 'Cena', porcentaje: 100 });
  });
});

describe('draftToCareRecord — borrador confirmado → registro de care.push', () => {
  const draft = careDraftSchema.parse({
    type: 'CONSTANTES',
    payload: { tension: '120/80', temperatura: 36.5 },
  });

  it('construye el IncomingCareRecord con timestamps por campo', () => {
    const recordedAt = new Date('2026-06-10T10:00:00.000Z');
    const record = draftToCareRecord(draft, {
      residentId: 'res-1',
      clientId: 'client-uuid',
      recordedAt,
    });
    expect(record).toEqual({
      clientId: 'client-uuid',
      residentId: 'res-1',
      type: 'CONSTANTES',
      recordedAt,
      payload: { tension: '120/80', temperatura: 36.5 },
      fieldTimestamps: {
        tension: '2026-06-10T10:00:00.000Z',
        temperatura: '2026-06-10T10:00:00.000Z',
      },
    });
  });

  it('omite campos vacíos o indefinidos', () => {
    const sparse = careDraftSchema.parse({ type: 'ABVD', payload: { nota: 'aseo', actividad: '' } });
    const record = draftToCareRecord(sparse, { residentId: 'r', clientId: 'c' });
    expect(record.payload).toEqual({ nota: 'aseo' });
    expect(Object.keys(record.fieldTimestamps)).toEqual(['nota']);
  });
});
