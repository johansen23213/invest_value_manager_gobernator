import { describe, expect, it } from 'vitest';
import { StubProvider } from '../src/providers/stub';
import { createProvider } from '../src/providers';
import { runToolUseLoop } from '../src/provider';
import { copilotToolDefinitions } from '../src/tools';
import type { CompletionInput, ToolCall, ToolResult } from '../src/provider';

function baseInput(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    system: 'sistema',
    messages: [{ role: 'user', content: 'hola' }],
    maxTokens: 256,
    ...overrides,
  };
}

describe('StubProvider — determinismo', () => {
  it('id es stub y la fábrica lo devuelve por defecto', () => {
    expect(new StubProvider().id).toBe('stub');
    expect(createProvider({}).id).toBe('stub');
    expect(createProvider({ AI_PROVIDER: 'stub' }).id).toBe('stub');
  });

  it('dos completions con el mismo input son idénticas', async () => {
    const p = new StubProvider();
    const a = await p.complete(baseInput());
    const b = await p.complete(baseInput());
    expect(a).toEqual(b);
  });

  it('reporta un id de modelo resuelto por tier', async () => {
    const p = new StubProvider();
    const r = await p.complete(baseInput({ tier: 'reasoning' }));
    expect(r.model).toBe('stub-reasoning');
  });

  it('responseFormat json devuelve objeto estructurado por reglas', async () => {
    const p = new StubProvider();
    const r = await p.complete(
      baseInput({
        messages: [{ role: 'user', content: 'temperatura 37.5 ºC' }],
        responseFormat: { type: 'json' },
      }),
    );
    const parsed = JSON.parse(r.text);
    expect(parsed.type).toBe('CONSTANTES');
    // Claves de payload alineadas con la UI de atención (tension/fc/temperatura/sato2).
    expect(parsed.payload.temperatura).toBe(37.5);
    expect(r.toolCalls).toHaveLength(0);
  });

  it('sin tools no emite toolCalls', async () => {
    const p = new StubProvider();
    const r = await p.complete(baseInput({ messages: [{ role: 'user', content: 'caída' }] }));
    expect(r.toolCalls).toHaveLength(0);
    expect(r.stopReason).toBe('end');
  });
});

describe('StubProvider — extracción JSON de utterances típicos (feature 1)', () => {
  const p = new StubProvider();
  const extractJson = async (content: string) => {
    const r = await p.complete(
      baseInput({ messages: [{ role: 'user', content }], responseFormat: { type: 'json' } }),
    );
    return JSON.parse(r.text) as { type: string; payload: Record<string, unknown> };
  };

  it('"tensión 120/80, 36.5ºC" → CONSTANTES con tensión y temperatura', async () => {
    const parsed = await extractJson('tensión 120/80, 36.5ºC');
    expect(parsed.type).toBe('CONSTANTES');
    expect(parsed.payload.tension).toBe('120/80');
    expect(parsed.payload.temperatura).toBe(36.5);
  });

  it('"ha comido la mitad" → INGESTA con porcentaje 50', async () => {
    const parsed = await extractJson('ha comido la mitad');
    expect(parsed.type).toBe('INGESTA');
    expect(parsed.payload.porcentaje).toBe(50);
  });

  it('"deposición normal" → DEPOSICION con deposicion Sí y notas', async () => {
    const parsed = await extractJson('deposición normal');
    expect(parsed.type).toBe('DEPOSICION');
    expect(parsed.payload.deposicion).toBe('Sí');
    expect(parsed.payload.notas).toBe('deposición normal');
  });

  it('"se ha caído en el baño" → INCIDENCIA con descripción', async () => {
    const parsed = await extractJson('se ha caído en el baño');
    expect(parsed.type).toBe('INCIDENCIA');
    expect(parsed.payload.descripcion).toBe('se ha caído en el baño');
  });

  it('catalán: "ha sopat tot el menjar" → INGESTA con porcentaje 100', async () => {
    const parsed = await extractJson('ha sopat tot el menjar');
    expect(parsed.type).toBe('INGESTA');
    expect(parsed.payload.comida).toBe('Cena');
    expect(parsed.payload.porcentaje).toBe(100);
  });

  it('texto seudonimizado ([[PERSONA_1]]) no rompe la derivación', async () => {
    const parsed = await extractJson('[[PERSONA_1]] ha desayunado todo');
    expect(parsed.type).toBe('INGESTA');
    expect(parsed.payload.comida).toBe('Desayuno');
    expect(parsed.payload.porcentaje).toBe(100);
  });

  it('texto sin señal clara cae a ABVD con nota', async () => {
    const parsed = await extractJson('le he ayudado con el aseo');
    expect(parsed.type).toBe('ABVD');
    expect(parsed.payload.nota).toBe('le he ayudado con el aseo');
  });
});

describe('StubProvider — borrador de PIA en JSON (feature 2, tier reasoning)', () => {
  const p = new StubProvider();
  const SYSTEM_PIA =
    'Eres un asistente que redacta un borrador de Plan Individualizado de Atención (PIA/PAI).';

  const draftPia = async (summary: string) => {
    const r = await p.complete({
      system: SYSTEM_PIA,
      messages: [{ role: 'user', content: summary }],
      tier: 'reasoning',
      maxTokens: 1024,
      responseFormat: { type: 'json' },
    });
    return {
      result: r,
      json: JSON.parse(r.text) as {
        title: string;
        goals: { description: string }[];
        notes?: string;
      },
    };
  };

  it('resumen con dependencia/Barthel → objetivo de ABVD', async () => {
    const { result, json } = await draftPia(
      'Dependencia grado II. Barthel 45. Diagnósticos: HTA.',
    );
    expect(result.model).toBe('stub-reasoning');
    expect(json.title).toMatch(/PIA|Plan Individualizado/);
    expect(json.goals.length).toBeGreaterThanOrEqual(1);
    expect(json.goals.length).toBeLessThanOrEqual(3);
    expect(json.goals.some((g) => /ABVD|autonomía|Barthel/i.test(g.description))).toBe(true);
  });

  it('resumen con caídas/Tinetti → objetivo de prevención de caídas', async () => {
    const { json } = await draftPia('Tinetti 12. Antecedentes de caídas. Movilidad reducida.');
    expect(json.goals.some((g) => /caída|marcha|equilibrio/i.test(g.description))).toBe(true);
  });

  it('combina varias señales clínicas en objetivos distintos (tope 3)', async () => {
    const { json } = await draftPia(
      'Dependencia grado III, Barthel 20, Tinetti 8, riesgo de úlceras por presión, desnutrición.',
    );
    expect(json.goals.length).toBe(3);
    const all = json.goals.map((g) => g.description).join(' | ');
    expect(all).toMatch(/ABVD|autonomía/i);
    expect(all).toMatch(/caída|marcha|equilibrio/i);
  });

  it('resumen sin señales claras devuelve al menos un objetivo (esquema exige 1..10)', async () => {
    const { json } = await draftPia('Persona estable sin incidencias relevantes.');
    expect(json.goals.length).toBe(1);
    expect(json.goals[0]?.description.length).toBeGreaterThan(0);
  });

  it('catalán: "dependència, Barthel" → objetivo de ABVD', async () => {
    const { json } = await draftPia('Dependència grau II. Barthel 50. Diagnòstics: diabetis.');
    expect(json.goals.some((g) => /ABVD|autonomía|Barthel/i.test(g.description))).toBe(true);
  });

  it('texto seudonimizado ([[PERSONA_1]]) no rompe la derivación', async () => {
    const { json } = await draftPia('[[PERSONA_1]] con dependencia y antecedentes de caídas.');
    expect(json.goals.length).toBeGreaterThanOrEqual(2);
  });

  it('NO confunde una petición extraction (feature 1) con un PIA', async () => {
    // Mismo texto pero tier extraction y sin plantilla de PIA → CareRecord, no PIA.
    const r = await p.complete({
      system: 'Conviertes notas en CareRecord.',
      messages: [{ role: 'user', content: 'dependencia y caídas' }],
      tier: 'extraction',
      maxTokens: 512,
      responseFormat: { type: 'json' },
    });
    const json = JSON.parse(r.text) as { type?: string; title?: string };
    expect(json.type).toBeDefined();
    expect(json.title).toBeUndefined();
  });
});

describe('StubProvider — emisión de toolCalls', () => {
  const tools = copilotToolDefinitions();

  it('frase de cuidado emite proposeCareRecord', async () => {
    const p = new StubProvider();
    const r = await p.complete(
      baseInput({ messages: [{ role: 'user', content: 'tuvo una deposición' }], tools }),
    );
    expect(r.stopReason).toBe('tool_use');
    expect(r.toolCalls[0]?.name).toBe('proposeCareRecord');
    expect((r.toolCalls[0]?.input as { type: string }).type).toBe('DEPOSICION');
  });

  it('mención de PIA emite proposeCarePlan', async () => {
    const p = new StubProvider();
    const r = await p.complete(
      baseInput({ messages: [{ role: 'user', content: 'redacta el PIA' }], tools }),
    );
    expect(r.toolCalls[0]?.name).toBe('proposeCarePlan');
  });
});

describe('runToolUseLoop con StubProvider', () => {
  const tools = copilotToolDefinitions();

  it('itera: emite toolCall, la ejecuta y termina con texto', async () => {
    const p = new StubProvider();
    const executed: ToolCall[] = [];
    const execute = async (call: ToolCall): Promise<ToolResult> => {
      executed.push(call);
      return { toolCallId: call.id, content: { ok: true } };
    };

    const result = await runToolUseLoop(
      p,
      baseInput({ messages: [{ role: 'user', content: 'ingesta completa' }], tools }),
      execute,
    );

    expect(executed).toHaveLength(1);
    expect(executed[0]?.name).toBe('proposeCareRecord');
    expect(result.final.toolCalls).toHaveLength(0);
    expect(result.stoppedForConfirmation).toBe(false);
    expect(result.iterations).toBe(2); // 1ª: toolCall, 2ª: texto final
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('confirmToolCalls=false detiene sin ejecutar (humano no confirma)', async () => {
    const p = new StubProvider();
    let executedCount = 0;
    const execute = async (call: ToolCall): Promise<ToolResult> => {
      executedCount += 1;
      return { toolCallId: call.id, content: null };
    };

    const result = await runToolUseLoop(
      p,
      baseInput({ messages: [{ role: 'user', content: 'caída en el baño' }], tools }),
      execute,
      { confirmToolCalls: () => false },
    );

    expect(executedCount).toBe(0);
    expect(result.stoppedForConfirmation).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it('sin toolCalls termina en una iteración', async () => {
    const p = new StubProvider();
    const execute = async (call: ToolCall): Promise<ToolResult> => ({
      toolCallId: call.id,
      content: null,
    });
    const result = await runToolUseLoop(p, baseInput(), execute);
    expect(result.iterations).toBe(1);
    expect(result.stoppedForConfirmation).toBe(false);
  });
});
