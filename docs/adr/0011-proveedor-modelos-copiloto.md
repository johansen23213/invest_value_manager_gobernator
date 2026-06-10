# ADR 0011 — Proveedor y modelos del Copiloto (cierre de A-003)

- **Estado:** Aceptada (estrategia + proveedor por defecto). Pendiente: benchmark
  es/ca de calidad sobre prompts reales y elección final de proveedor de hosting.
- **Fecha:** 2026-06-09
- **Relacionado:** **concreta ADR-0010** (estrategia provider-agnóstica) y cierra el
  supuesto **A-003** (dónde viven app + Postgres + inferencia). Datos de mercado de
  junio 2026 (fuentes citadas en el resumen de la sesión).

## Contexto

ADR-0010 fijó la estrategia (provider-agnóstica, liderar open-source soberano UE,
Claude-UE como fallback) pero dejó abiertos el **modelo concreto, el proveedor EU y
cuándo aprovisionar GPU**. La investigación de mercado revela un **tercer tier** que
estaba infravalorado y que cambia la recomendación:

> Existe **inferencia gestionada (serverless, por token) de modelos open-weight en
> data centers UE soberanos**: **OVHcloud AI Endpoints** (Gravelines, FR) y **Scaleway
> Generative APIs** (FR). Dan **residencia UE + no reutilización de datos + modelos
> abiertos** SIN coste fijo de GPU ni carga de MLOps, y exponen **API compatible con
> OpenAI** (encaja con nuestro adaptador `vllm`).

## Datos (junio 2026, ~ por 1M tokens; verificar IDs exactos al cablear)

**Tier A — Gestionado open-weight UE soberano (recomendado por defecto):**

| Proveedor / modelo                        | Uso                             | In     | Out    |
| ----------------------------------------- | ------------------------------- | ------ | ------ |
| OVHcloud · Mistral Small 3.2 24B          | extracción / razonamiento medio | $0.10  | $0.31  |
| OVHcloud · Qwen3 32B                      | extracción / razonamiento       | $0.09  | $0.25  |
| OVHcloud · Llama 3.3 70B                  | razonamiento (PIA)              | $0.74  | $0.74  |
| OVHcloud · Mistral 7B / Llama 3.1 8B      | extracción barata               | ~$0.11 | ~$0.11 |
| Scaleway Generative APIs (representativo) | —                               | ~€0.15 | ~€0.35 |

**Tier B — GPU dedicada autoalojada (a escala / máxima soberanía):**

| Opción                 | GPU / VRAM         | Coste                         |
| ---------------------- | ------------------ | ----------------------------- |
| Hetzner GEX130 (DE/FI) | RTX 6000 Ada 48 GB | €838/mes (€1.34/h)            |
| OVHcloud A100 (FR)     | A100               | €1.52–1.85/h (~€1.1–1.3k/mes) |

**Tier C — Claude gestionado UE (fallback de razonamiento, ADR-0008):**
Haiku $1/$5 · Sonnet $3/$15 · Opus $5/$25 por 1M.

**Modelos open-weight de referencia:** **Mistral Large 3** (675B MoE, **Apache 2.0**,
256K ctx, fuerte multilingüe incl. **español**; dic-2025) como tope de razonamiento vía
gestionado; **Mistral Small 4 / Small 3.2 24B, Ministral, Qwen3-32B, Llama 3.3 70B**
para extracción y razonamiento medio.

## Decisión

1. **Por defecto: Tier A (gestionado open-weight UE soberano).** Da el 90% del valor de
   soberanía (datos en UE, no usados para entrenar, modelos abiertos) con economía por
   token y cero ops. **~10–30× más barato que Claude** para nuestras 2 tareas.
2. **Modelos por tier (registro `models.ts`, resuelto por entorno, no hardcodear):**
   - **Extracción** (frase→`CareRecord`): un modelo pequeño/medio (p. ej. **Mistral
     Small 3.2 24B** o **Qwen3-32B**).
   - **Razonamiento** (borrador de PIA): **Llama 3.3 70B** o **Mistral Medium/Large 3**.
3. **Cablear el adaptador OpenAI-compatible** (`packages/ai/src/providers/vllm.ts`): sirve
   tal cual para OVHcloud/Scaleway (base URL + key por entorno). El `StubProvider` sigue
   de default en dev/tests.
4. **Benchmark es/ca** de las 2 features sobre prompts reales antes de fijar el modelo de
   PIA. Si la calidad del PIA no llega con open-weight → **enrutar solo esa feature** a
   **Mistral Large 3** (gestionado) o al **fallback Claude-UE** (Tier C). La abstracción
   ya lo permite por feature.
5. **Tier B (GPU dedicada)** solo cuando el volumen sostenido lo justifique
   económicamente o se exija que el dato no toque ni siquiera un proveedor gestionado.
6. **A-003 (hosting app + Postgres):** alojar en el **mismo proveedor EU soberano** que la
   inferencia para un stack coherente. Candidatos: **OVHcloud** o **Scaleway** (ambos FR,
   con Postgres gestionado y cómputo UE). **Criterio de desempate:** certificaciones para
   sector público español (**ENS**, SecNumCloud) y experiencia de despliegue. Recomendación
   inicial: **OVHcloud** (mayor presencia/soberanía declarada) o **Scaleway** (DX y "no
   reutilización de datos" explícita) — confirmar contra requisitos de cliente/ENS.

## Ilustración de coste

Para extracción a Mistral Small ($0.10/$0.31) y PIA a Llama 70B ($0.74), con el volumen
de unos pocos centros piloto, el coste mensual de inferencia es del orden de **decenas de
euros**, no de los **>€800/mes** de una GPU dedicada ni del coste de Claude. La GPU propia
solo gana a alto volumen.

## Consecuencias

- **ADR-0008** queda como **fallback** (Tier C), no vía principal. ADR-0010 se concreta.
- **Trabajo:** implementar el adaptador OpenAI-compatible en `vllm.ts` (testeable con
  `fetch` mockeado), poblar `models.ts`/`.env.example` con los IDs por proveedor, y correr
  el benchmark es/ca. Nada de esto cambia la UI ni los routers (la abstracción ya está).
- **Cumplimiento:** con Tier A se firma un DPA con el proveedor UE (datos en UE, sin
  reutilización). DPIA/RoPA a actualizar. Transparencia art. 50 ya en UI.
- **Reversibilidad:** como son **modelos open-weight**, migrar de gestionado (Tier A) a
  GPU propia (Tier B) es cambiar el endpoint del mismo modelo — sin reescribir prompts.
