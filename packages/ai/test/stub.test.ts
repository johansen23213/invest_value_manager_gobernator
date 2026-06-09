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
    expect(parsed.payload.temperature).toBe(37.5);
    expect(r.toolCalls).toHaveLength(0);
  });

  it('sin tools no emite toolCalls', async () => {
    const p = new StubProvider();
    const r = await p.complete(baseInput({ messages: [{ role: 'user', content: 'caída' }] }));
    expect(r.toolCalls).toHaveLength(0);
    expect(r.stopReason).toBe('end');
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
