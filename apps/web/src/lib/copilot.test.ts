import { describe, expect, it } from 'vitest';
import { StubProvider } from '@vetlla/ai';
import {
  CARE_DRAFT_FIELDS,
  CopilotDraftError,
  buildDossierSummary,
  careDraftSchema,
  carePlanDraftSchema,
  draftToCareRecord,
  generateCareDraft,
  generateCarePlanDraft,
  parseCarePlanDraft,
  parseCareDraft,
  rehydrateCarePlanDraft,
  rehydrateDraft,
  type ResidentDossier,
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

  it('tolera JSON envuelto en vallas de código (```json … ```) de un modelo local', () => {
    const draft = parseCareDraft(
      '```json\n{"type":"CONSTANTES","payload":{"tension":"130/85","temperatura":36.8}}\n```',
    );
    expect(draft.type).toBe('CONSTANTES');
    expect(draft.payload).toMatchObject({ tension: '130/85', temperatura: 36.8 });
  });

  it('tolera texto antes/después del objeto JSON', () => {
    const draft = parseCareDraft(
      'Claro, aquí tienes el registro: {"type":"INGESTA","payload":{"comida":"Comida","porcentaje":50}} ¡Listo!',
    );
    expect(draft.type).toBe('INGESTA');
    expect(draft.payload).toMatchObject({ comida: 'Comida', porcentaje: 50 });
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
    expect(result.promptVersion).toBe('careRecordExtraction.v2');
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

// ===========================================================================
// Feature 2 — Borrador de PIA/PAI
// ===========================================================================

describe('carePlanDraftSchema — validación del borrador de PIA', () => {
  it('acepta un PIA con título y un objetivo', () => {
    const parsed = carePlanDraftSchema.parse({
      title: 'PIA 2026',
      goals: [{ description: 'Mantener autonomía en ABVD' }],
    });
    expect(parsed.title).toBe('PIA 2026');
    expect(parsed.goals).toHaveLength(1);
  });

  it('acepta objetivos con targetDate opcional y notas', () => {
    const parsed = carePlanDraftSchema.parse({
      title: 'Plan',
      goals: [{ description: 'Prevenir caídas', targetDate: '2026-12-31' }],
      notes: 'Borrador IA',
    });
    expect(parsed.goals[0]?.targetDate).toBe('2026-12-31');
    expect(parsed.notes).toBe('Borrador IA');
  });

  it('rechaza un PIA sin objetivos (mínimo 1)', () => {
    expect(carePlanDraftSchema.safeParse({ title: 'X', goals: [] }).success).toBe(false);
  });

  it('rechaza más de 10 objetivos', () => {
    const goals = Array.from({ length: 11 }, (_, i) => ({ description: `Objetivo ${i}` }));
    expect(carePlanDraftSchema.safeParse({ title: 'X', goals }).success).toBe(false);
  });

  it('rechaza título vacío y objetivo con descripción vacía', () => {
    expect(carePlanDraftSchema.safeParse({ title: '', goals: [{ description: 'x' }] }).success).toBe(
      false,
    );
    expect(carePlanDraftSchema.safeParse({ title: 'X', goals: [{ description: '' }] }).success).toBe(
      false,
    );
  });

  it('rechaza título y objetivos demasiado largos', () => {
    expect(
      carePlanDraftSchema.safeParse({
        title: 'a'.repeat(161),
        goals: [{ description: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      carePlanDraftSchema.safeParse({
        title: 'X',
        goals: [{ description: 'a'.repeat(301) }],
      }).success,
    ).toBe(false);
  });
});

describe('parseCarePlanDraft — salida del modelo', () => {
  it('parsea JSON válido conforme al esquema', () => {
    const draft = parseCarePlanDraft('{"title":"PIA","goals":[{"description":"obj"}]}');
    expect(draft.title).toBe('PIA');
  });

  it('lanza CopilotDraftError con JSON roto', () => {
    expect(() => parseCarePlanDraft('no es json')).toThrow(CopilotDraftError);
  });

  it('lanza CopilotDraftError con JSON fuera de esquema (no guarda nada)', () => {
    expect(() => parseCarePlanDraft('{"title":"X","goals":[]}')).toThrow(CopilotDraftError);
  });
});

describe('rehydrateCarePlanDraft — los tokens PII vuelven a sus valores', () => {
  it('rehidrata título, objetivos y notas', () => {
    const draft = parseCarePlanDraft(
      '{"title":"PIA de [[PERSONA_1]]","goals":[{"description":"acompañar a [[PERSONA_1]]"}],"notes":"contacto [[PERSONA_2]]"}',
    );
    const map = [
      { token: '[[PERSONA_1]]', value: 'María García', category: 'PERSONA' as const },
      { token: '[[PERSONA_2]]', value: 'Joan', category: 'PERSONA' as const },
    ];
    const r = rehydrateCarePlanDraft(draft, map);
    expect(r.title).toBe('PIA de María García');
    expect(r.goals[0]?.description).toBe('acompañar a María García');
    expect(r.notes).toBe('contacto Joan');
  });

  it('sin mapa devuelve el borrador intacto', () => {
    const draft = parseCarePlanDraft('{"title":"PIA","goals":[{"description":"obj"}]}');
    expect(rehydrateCarePlanDraft(draft, [])).toBe(draft);
  });
});

describe('buildDossierSummary — resumen minimizado del expediente', () => {
  it('concatena dependencia, escalas, diagnósticos y alergias', () => {
    const summary = buildDossierSummary({
      dependencyGrade: 'GRADO_II',
      assessments: [{ type: 'BARTHEL', score: 45 }, { type: 'TINETTI', score: 12 }],
      diagnoses: [{ description: 'Demencia', code: 'F03' }],
      allergies: [{ substance: 'Penicilina', severity: 'GRAVE' }],
    });
    expect(summary).toContain('grado II');
    expect(summary).toContain('BARTHEL 45');
    expect(summary).toContain('TINETTI 12');
    expect(summary).toContain('Demencia (F03)');
    expect(summary).toContain('Penicilina (GRAVE)');
  });

  it('incluye las indicaciones del profesional', () => {
    const summary = buildDossierSummary({ guidance: 'Centrar en movilidad' });
    expect(summary).toContain('Centrar en movilidad');
  });

  it('da un resumen no vacío cuando no hay datos', () => {
    expect(buildDossierSummary({})).toContain('Sin datos clínicos');
  });
});

describe('generateCarePlanDraft — flujo completo con StubProvider (sin red, sin BD)', () => {
  const provider = new StubProvider();

  it('expediente con dependencia/Barthel → PIA con objetivo de ABVD (tier reasoning)', async () => {
    const result = await generateCarePlanDraft(provider, {
      dossier: {
        dependencyGrade: 'GRADO_II',
        assessments: [{ type: 'BARTHEL', score: 45 }],
      },
    });
    expect(result.model).toBe('stub-reasoning');
    expect(result.promptVersion).toBe('carePlanDraft.v2');
    expect(result.draft.goals.length).toBeGreaterThanOrEqual(1);
    expect(
      result.draft.goals.some((g) => /ABVD|autonomía|Barthel/i.test(g.description)),
    ).toBe(true);
    // El borrador valida contra el esquema (contrato modelo↔servidor↔UI).
    expect(carePlanDraftSchema.safeParse(result.draft).success).toBe(true);
  });

  it('expediente con Tinetti/caídas → objetivo de prevención de caídas', async () => {
    const result = await generateCarePlanDraft(provider, {
      dossier: { assessments: [{ type: 'TINETTI', score: 10 }] },
    });
    expect(result.draft.goals.some((g) => /caída|marcha|equilibrio/i.test(g.description))).toBe(
      true,
    );
  });

  it('minimiza PII antes del provider (nombres y contactos seudonimizados)', async () => {
    const dossier: ResidentDossier = {
      knownNames: ['María García', 'María', 'García'],
      dependencyGrade: 'GRADO_II',
      // PII colada en una indicación libre: nombre + teléfono.
      guidance: 'Coordinar con María García, tel. 612345678',
    };
    const result = await generateCarePlanDraft(provider, { dossier });
    // Lo ÚNICO que vio el modelo: resumen seudonimizado, sin el nombre ni el teléfono.
    expect(result.redactedSummary).not.toContain('María');
    expect(result.redactedSummary).not.toContain('612345678');
    expect(result.redactedSummary).toContain('[[PERSONA_1]]');
    expect(result.redactedSummary).toContain('[[TELEFONO_1]]');
    // El borrador devuelto sigue siendo válido.
    expect(carePlanDraftSchema.safeParse(result.draft).success).toBe(true);
  });

  it('selecciona la plantilla por locale sin romper el flujo (ca)', async () => {
    const result = await generateCarePlanDraft(provider, {
      dossier: { dependencyGrade: 'GRADO_I' },
      locale: 'ca',
    });
    expect(result.draft.goals.length).toBeGreaterThanOrEqual(1);
    expect(carePlanDraftSchema.safeParse(result.draft).success).toBe(true);
  });
});
