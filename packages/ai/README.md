# @vetlla/ai

Fundación **provider-agnóstica** del copiloto de IA de Vetlla (ver
[`docs/adr/0010-estrategia-modelos-copiloto.md`](../../docs/adr/0010-estrategia-modelos-copiloto.md)).

Toda la capa de IA del producto se apoya en la interfaz `ModelProvider`. La elección de
motor (open-source self-host en la UE, Claude-UE como fallback, o el stub) es
**reversible y configurable por entorno**, y se puede **mezclar por tarea**. El
diferencial es la UX del copiloto + el flujo **humano-en-el-bucle**, no el modelo concreto.

## Qué hay en este paquete (Slice 1)

- **`provider.ts`** — interfaz `ModelProvider` (`complete`) + bucle de tool-use manual
  (`runToolUseLoop`) pensado para confirmación humana antes de persistir. El modelo
  **nunca toca la BD**: solo emite `toolCalls`; quien ejecuta es la app.
- **`models.ts`** — registro `tier → id de modelo` por proveedor, resuelto por entorno.
  Tiers semánticos: `extraction` (barato) y `reasoning` (potente).
- **`providers/`** — `StubProvider` (determinista, sin red) + esqueletos `vllm`,
  `bedrock`, `vertex` (lanzan `NotImplementedError` hasta cablearse).
- **`privacy.ts`** — seudonimización de PII (`redactPii` / `rehydrate`) para no enviar
  identificadores directos al modelo.
- **`tools.ts`** — definiciones de herramientas tipadas (Zod): lecturas (`getResident`,
  `listCareRecords`) y escrituras-propuesta (`proposeCareRecord`, `proposeCarePlan`).
- **`prompts/`** — plantillas versionadas es-ES / ca-ES de las 2 features estrella.

## StubProvider: dev/test sin modelo

En este entorno **no hay GPU, clave ni red de inferencia**. `StubProvider` implementa
`ModelProvider` con respuestas **deterministas** derivadas por reglas del input:

- extracción frase→`CareRecord` por palabras clave (CONSTANTES, INGESTA, …),
- emisión de una `toolCall` predecible cuando se pasan `tools`,
- cierre con texto cuando ya hay un `tool_result` (el bucle de tool-use termina).

Es el proveedor por defecto cuando `AI_PROVIDER=stub` o no hay configuración, así que
las features 1 y 2 se desarrollan y testean **sin ningún modelo real**.

```ts
import { createProvider, runToolUseLoop, copilotToolDefinitions } from '@vetlla/ai';

const provider = createProvider(process.env); // stub en local
const result = await runToolUseLoop(
  provider,
  {
    system: '…',
    messages: [{ role: 'user', content: 'tuvo una caída' }],
    maxTokens: 512,
    tools: copilotToolDefinitions(),
  },
  async (call) => ({ toolCallId: call.id, content: { ok: true } }), // aquí rol/tenant/RLS + confirmación
  { confirmToolCalls: (calls) => askHuman(calls) }, // humano en el bucle
);
```

## Variables de entorno

| Variable                                   | Descripción                                                                        | Default |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | ------- |
| `AI_PROVIDER`                              | `stub` \| `vllm` \| `bedrock` \| `vertex`                                          | `stub`  |
| `AI_MODEL_<TIER>`                          | Id de modelo para un tier, independiente de proveedor (`AI_MODEL_REASONING`)       | —       |
| `AI_MODEL_<PROVIDER>_<TIER>`               | Id de modelo específico (gana sobre el genérico), p. ej. `AI_MODEL_VLLM_REASONING` | —       |
| `AI_VLLM_BASE_URL` / `AI_VLLM_API_KEY`     | Endpoint OpenAI-compatible self-host (UE)                                          | —       |
| `AI_BEDROCK_REGION`                        | Región AWS **UE** para el fallback Claude-UE                                       | —       |
| `AI_VERTEX_PROJECT` / `AI_VERTEX_LOCATION` | Proyecto/location **UE** para Vertex                                               | —       |

Precedencia de resolución de modelo: `AI_MODEL_<PROVIDER>_<TIER>` →
`AI_MODEL_<TIER>` → default del registro. **Sin red en local**: deja `AI_PROVIDER` sin
fijar (o `stub`).

## Scripts

```bash
pnpm --filter @vetlla/ai typecheck
pnpm --filter @vetlla/ai test
pnpm --filter @vetlla/ai lint
```

## Fuera de alcance (Slice 2+)

Cablear las herramientas a los procedures tRPC (con rol/tenant/RLS), endpoints de
confirmación, `AuditLog` de cada acción del copiloto, y la inferencia real de los
adaptadores `vllm`/`bedrock`/`vertex`.
