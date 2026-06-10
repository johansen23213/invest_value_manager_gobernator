/**
 * vllm.test.ts — Tests del adaptador OpenAI-compatible (`VllmProvider`).
 *
 * NO toca red real: `fetch` se mockea con `vi.stubGlobal`. Cubre el mapeo del contrato
 * Vetlla ↔ OpenAI Chat Completions (request bien formado, response_format, tools,
 * tool_calls, finish_reason, usage), la resolución de modelo (model > tier/env > default),
 * y la robustez (errores HTTP, falta de baseUrl, cabecera Authorization).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VllmProvider } from '../src/providers/vllm';
import { createProvider } from '../src/providers';
import { ProviderConfigError, ProviderRequestError } from '../src/providers/errors';
import type { CompletionInput } from '../src/provider';

function baseInput(overrides: Partial<CompletionInput> = {}): CompletionInput {
  return {
    system: 'Eres un asistente sanitario.',
    messages: [{ role: 'user', content: 'ha comido la mitad' }],
    maxTokens: 256,
    ...overrides,
  };
}

/** Construye una respuesta OpenAI Chat Completions mínima y válida. */
function chatResponse(
  overrides: {
    content?: string | null;
    tool_calls?: unknown[];
    finish_reason?: string;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } = {},
): unknown {
  return {
    model: overrides.model ?? 'mistral-small-3.2-24b',
    choices: [
      {
        message: {
          content: 'content' in overrides ? (overrides.content ?? null) : 'hola',
          ...(overrides.tool_calls ? { tool_calls: overrides.tool_calls } : {}),
        },
        finish_reason: overrides.finish_reason ?? 'stop',
      },
    ],
    usage: overrides.usage ?? { prompt_tokens: 42, completion_tokens: 7 },
  };
}

/** Mock de `fetch` que devuelve una respuesta OK con el JSON dado. */
function mockFetchOk(json: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(JSON.stringify(json)),
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Devuelve [url, init] de la última llamada a fetch, con el body ya parseado. */
function lastCall(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  };
}

const BASE_URL = 'https://oai.endpoints.example.cloud.ovh.net/v1';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VllmProvider — identidad y fábrica', () => {
  it('id es vllm', () => {
    expect(new VllmProvider().id).toBe('vllm');
  });

  it('createProvider devuelve VllmProvider solo con AI_PROVIDER=vllm', () => {
    expect(createProvider({ AI_PROVIDER: 'vllm', AI_VLLM_BASE_URL: BASE_URL }).id).toBe('vllm');
    // Sin AI_PROVIDER el default sigue siendo stub.
    expect(createProvider({}).id).toBe('stub');
  });
});

describe('VllmProvider — request bien formado', () => {
  it('hace POST a {baseUrl}/chat/completions con model, messages y max_tokens', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await p.complete(baseInput({ model: 'mi-modelo' }));

    const call = lastCall(fetchMock);
    expect(call.url).toBe(`${BASE_URL}/chat/completions`);
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body.model).toBe('mi-modelo');
    expect(call.body.max_tokens).toBe(256);
    expect(call.body.messages).toEqual([
      { role: 'system', content: 'Eres un asistente sanitario.' },
      { role: 'user', content: 'ha comido la mitad' },
    ]);
  });

  it('normaliza la barra final de la baseUrl', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: `${BASE_URL}/` });
    await p.complete(baseInput());
    expect(lastCall(fetchMock).url).toBe(`${BASE_URL}/chat/completions`);
  });

  it('incluye temperature solo si viene definida', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL });

    await p.complete(baseInput());
    expect('temperature' in lastCall(fetchMock).body).toBe(false);

    await p.complete(baseInput({ temperature: 0 }));
    expect(lastCall(fetchMock).body.temperature).toBe(0);
  });
});

describe('VllmProvider — Authorization', () => {
  it('añade Bearer solo si hay apiKey', async () => {
    const fetchMock = mockFetchOk(chatResponse());

    await new VllmProvider({ baseUrl: BASE_URL }).complete(baseInput());
    expect('Authorization' in lastCall(fetchMock).headers).toBe(false);

    await new VllmProvider({ baseUrl: BASE_URL, apiKey: 'sk-secret' }).complete(baseInput());
    expect(lastCall(fetchMock).headers.Authorization).toBe('Bearer sk-secret');
  });
});

describe('VllmProvider — responseFormat', () => {
  it('json sin schema → response_format json_object', async () => {
    const fetchMock = mockFetchOk(chatResponse({ content: '{}' }));
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await p.complete(baseInput({ responseFormat: { type: 'json' } }));
    expect(lastCall(fetchMock).body.response_format).toEqual({ type: 'json_object' });
  });

  it('json con schema → response_format json_schema', async () => {
    const fetchMock = mockFetchOk(chatResponse({ content: '{}' }));
    const p = new VllmProvider({ baseUrl: BASE_URL });
    const schema = { type: 'object', properties: { title: { type: 'string' } } };
    await p.complete(baseInput({ responseFormat: { type: 'json', schema } }));
    expect(lastCall(fetchMock).body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'response', schema, strict: true },
    });
  });

  it('text → no añade response_format', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await p.complete(baseInput({ responseFormat: { type: 'text' } }));
    expect('response_format' in lastCall(fetchMock).body).toBe(false);
  });
});

describe('VllmProvider — tools', () => {
  it('mapea ToolDefinition[] a tools function-calling de OpenAI', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL });
    const inputSchema = { type: 'object', properties: { residentId: { type: 'string' } } };
    await p.complete(
      baseInput({
        tools: [{ name: 'proposeCareRecord', description: 'Propone un registro', inputSchema }],
      }),
    );
    expect(lastCall(fetchMock).body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'proposeCareRecord',
          description: 'Propone un registro',
          parameters: inputSchema,
        },
      },
    ]);
  });

  it('no añade tools si la lista está vacía', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await p.complete(baseInput({ tools: [] }));
    expect('tools' in lastCall(fetchMock).body).toBe(false);
  });

  it('parsea tool_calls con arguments JSON → ToolCall[] con input deserializado', async () => {
    mockFetchOk(
      chatResponse({
        content: null,
        finish_reason: 'tool_calls',
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'proposeCareRecord',
              arguments: '{"residentId":"r1","type":"INGESTA"}',
            },
          },
        ],
      }),
    );
    const p = new VllmProvider({ baseUrl: BASE_URL });
    const r = await p.complete(baseInput());

    expect(r.text).toBe('');
    expect(r.stopReason).toBe('tool_use');
    expect(r.toolCalls).toEqual([
      { id: 'call_abc', name: 'proposeCareRecord', input: { residentId: 'r1', type: 'INGESTA' } },
    ]);
  });

  it('lanza error claro si los arguments no son JSON válido', async () => {
    mockFetchOk(
      chatResponse({
        content: null,
        tool_calls: [
          { id: 'call_x', function: { name: 'proposeCareRecord', arguments: '{no-json' } },
        ],
      }),
    );
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await expect(p.complete(baseInput())).rejects.toThrow(ProviderRequestError);
  });
});

describe('VllmProvider — mapeo de respuesta', () => {
  it('mapea finish_reason → stopReason', async () => {
    const cases: { finish_reason: string; expected: string }[] = [
      { finish_reason: 'stop', expected: 'end' },
      { finish_reason: 'length', expected: 'max_tokens' },
      { finish_reason: 'tool_calls', expected: 'tool_use' },
      { finish_reason: 'content_filter', expected: 'end' },
    ];
    for (const c of cases) {
      mockFetchOk(chatResponse({ finish_reason: c.finish_reason }));
      const r = await new VllmProvider({ baseUrl: BASE_URL }).complete(baseInput());
      expect(r.stopReason).toBe(c.expected);
    }
  });

  it('mapea usage y text desde la respuesta', async () => {
    mockFetchOk(
      chatResponse({
        content: 'respuesta del modelo',
        usage: { prompt_tokens: 100, completion_tokens: 25 },
      }),
    );
    const r = await new VllmProvider({ baseUrl: BASE_URL }).complete(baseInput());
    expect(r.text).toBe('respuesta del modelo');
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 25 });
  });

  it('content null → text vacío y usage ausente → ceros', async () => {
    mockFetchOk({
      model: 'm',
      choices: [{ message: { content: null }, finish_reason: 'stop' }],
    });
    const r = await new VllmProvider({ baseUrl: BASE_URL }).complete(baseInput());
    expect(r.text).toBe('');
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('reporta el model de la respuesta', async () => {
    mockFetchOk(chatResponse({ model: 'llama-3.3-70b' }));
    const r = await new VllmProvider({ baseUrl: BASE_URL }).complete(baseInput());
    expect(r.model).toBe('llama-3.3-70b');
  });
});

describe('VllmProvider — resolución de modelo', () => {
  it('usa input.model si viene', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL, env: { AI_PROVIDER: 'vllm' } });
    await p.complete(baseInput({ model: 'explicito', tier: 'extraction' }));
    expect(lastCall(fetchMock).body.model).toBe('explicito');
  });

  it('resuelve por tier+env cuando no hay model (override por env)', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({
      baseUrl: BASE_URL,
      env: { AI_PROVIDER: 'vllm', AI_MODEL_VLLM_REASONING: 'modelo-del-env' },
    });
    await p.complete(baseInput({ tier: 'reasoning' }));
    expect(lastCall(fetchMock).body.model).toBe('modelo-del-env');
  });

  it('cae al default del registro por tier cuando no hay model ni override', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL, env: { AI_PROVIDER: 'vllm' } });
    await p.complete(baseInput({ tier: 'extraction' }));
    expect(lastCall(fetchMock).body.model).toBe('mistral-small-3.2-24b');
  });

  it('sin model ni tier usa el tier por defecto (reasoning)', async () => {
    const fetchMock = mockFetchOk(chatResponse());
    const p = new VllmProvider({ baseUrl: BASE_URL, env: { AI_PROVIDER: 'vllm' } });
    await p.complete(baseInput());
    expect(lastCall(fetchMock).body.model).toBe('llama-3.3-70b');
  });
});

describe('VllmProvider — robustez', () => {
  it('lanza ProviderConfigError claro si falta baseUrl', async () => {
    const p = new VllmProvider({});
    await expect(p.complete(baseInput())).rejects.toThrow(ProviderConfigError);
    await expect(p.complete(baseInput())).rejects.toThrow(/AI_VLLM_BASE_URL/);
  });

  it('respuesta 4xx → ProviderRequestError con status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"invalid api key"}'),
      } as unknown as Response),
    );
    const p = new VllmProvider({ baseUrl: BASE_URL, apiKey: 'bad' });
    await expect(p.complete(baseInput())).rejects.toMatchObject({
      name: 'ProviderRequestError',
      status: 401,
    });
  });

  it('respuesta 5xx → ProviderRequestError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('upstream unavailable'),
      } as unknown as Response),
    );
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await expect(p.complete(baseInput())).rejects.toThrow(/503/);
  });

  it('error de red → ProviderRequestError envuelto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const p = new VllmProvider({ baseUrl: BASE_URL });
    await expect(p.complete(baseInput())).rejects.toThrow(ProviderRequestError);
  });

  it('no incluye el apiKey en el mensaje de error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      } as unknown as Response),
    );
    const p = new VllmProvider({ baseUrl: BASE_URL, apiKey: 'sk-supersecret' });
    const err = await p.complete(baseInput()).catch((e: unknown) => e);
    expect(String(err)).not.toContain('sk-supersecret');
  });
});
