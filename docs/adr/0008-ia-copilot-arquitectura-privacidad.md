# ADR 0008 — IA Copilot (H5): arquitectura, residencia de datos y privacidad

- **Estado:** Propuesta (pendiente de confirmación de Angel — ver `project_state.yaml` Q-001)
- **Fecha:** 2026-06-08
- **Relacionado:** H5 (diferido), principios de producto (datos UE obligatoria, humano en el bucle),
  ADR 0002 (RLS), ADR 0007 (AuditLog). Investigación de fuentes en los paquetes de junio 2026.

> Etiquetas de confianza en los hechos: `[Confirmado]` (fuente primaria) · `[Estimado]` · `[No confirmado]`.

## Contexto

H5 (el copiloto de IA, *diferencial declarado* de Vetlla) se difirió el 2026-06-07 con el motivo:
*"no se usará API key de Anthropic por ahora; pendiente decidir qué modelo usar (UE/coste/capacidad)"*.
Este ADR resuelve esa incógnita. El principio **no negociable** que la condiciona: *"Nada de PII de salud
sale de la UE"* (art. 9 RGPD, residencia de datos en la UE obligatoria), *"humano siempre en el bucle"* para
datos clínicos, y *"el modelo nunca toca la BD: llama herramientas tipadas que validan permisos, rol y tenant"*.

### El hallazgo que lo cambia todo

**La API de primera parte (1P) de Anthropic NO ofrece residencia de datos en la UE.** Sus controles de
data residency solo permiten `inference_geo: "global"` (por defecto) o `"us"`, y almacenamiento (`workspace
geo`) solo en `"us"`. `[Confirmado — platform.claude.com/docs/manage-claude/data-residency, jun-2026]`

→ **Usar la API directa de Anthropic sería una violación del principio de residencia UE.** Esto explica —y
justifica— el diferimiento. La solución no es "esperar"; es **acceder a los mismos modelos Claude a través de
un cloud que garantiza la inferencia en la UE**.

## Las dos features de H5 (sin cambios de alcance)

1. **Lenguaje natural → `CareRecord` estructurado** (con confirmación previa, es/ca). Tarea de
   **extracción/clasificación** → modelo barato (Haiku). El modelo produce el payload que ya valida
   `care.push` (esquema Zod `incomingRecord`); el humano confirma; la mutación existente escribe y audita.
2. **Borrador de PIA/seguimiento que requiere aprobación humana.** Tarea de **redacción/razonamiento** →
   modelo capaz (Sonnet). El modelo propone `CarePlan` + objetivos; el humano aprueba; corren
   `carePlans.create`/`addGoal`.

En ambos casos el modelo **propone**, el humano **confirma**, y las tuberías tipadas existentes
(`permissionProcedure` → RLS por `ctx.db` → RBAC → `ctx.audit`) **ejecutan y auditan**. El modelo nunca
toca la BD. La arquitectura de H0–H6 ya soporta esto; falta `packages/ai`.

## Decisión (propuesta)

### 1. Hosting del modelo: NO la API 1P de Anthropic, sino Claude a través de un cloud con región UE

Opciones evaluadas:

| Vía | Residencia UE | No-entrenamiento / no compartido con Anthropic | Apto salud UE-only |
|---|---|---|---|
| **API Anthropic 1P** | ❌ solo `us`/`global` | Sí (ZDR con acuerdo) | **NO** `[Confirmado]` |
| **AWS Bedrock (EU in-region, p. ej. Fráncfort)** | ✅ datos en reposo en la región; cómputo dentro de la geografía UE | ✅ *"inputs/outputs no se comparten con los proveedores de modelo"* | **SÍ** `[Confirmado]` |
| **Google Vertex AI (endpoint `eu` / `europe-west1`)** | ✅ residencia UE | ✅ ZDR; logging opcional sin acceso de Google/Anthropic | **SÍ** `[Confirmado]` |
| **Microsoft Foundry** | ❌ enruta a servidores de Anthropic ("UE coming 2026") | — | **NO hoy** `[Confirmado]` |
| **Mistral (UE / on-prem)** | ✅ UE-native / on-prem | ✅ | SÍ (plan B soberano) `[Estimado]` |

**Recomendación: Claude vía AWS Bedrock en región UE in-region (Fráncfort `eu-central-1`)** como opción
principal, con **Google Vertex AI (endpoint `eu`)** como alternativa equivalente. El **desempate real** es
*alinear la región de IA con donde vivan la app y el Postgres de Vetlla* (decisión de despliegue A-003,
pendiente): minimiza latencia, transferencias transfronterizas y número de subencargados. Si la BD acaba en
AWS-EU → Bedrock; si en GCP-EU → Vertex.

- **Modelos:** copiloto = **Sonnet 4.6**; extracción/clasificación = **Haiku 4.5**. `[Confirmado disponibles
  en Bedrock UE y Vertex UE; verificar el modelo exacto por región en consola antes de fijar]`
- **IDs de modelo** difieren por proveedor (Bedrock prefija `anthropic.`; Vertex usa su propio esquema). Se
  **centralizan en `packages/ai`** y se resuelven contra `docs.claude.com`, no se hardcodean a ciegas (como
  ya manda CLAUDE.md).
- **Implicación técnica:** Bedrock y Vertex **no** soportan Managed Agents ni las herramientas server-side de
  Anthropic. Da igual: el diseño de Vetlla es **tool use propio con bucle manual** (necesario para las
  compuertas de aprobación humana). Usaremos `@anthropic-ai/bedrock-sdk` (`AnthropicBedrock`) o
  `@anthropic-ai/vertex-sdk` (`AnthropicVertex`) con el bucle de herramientas manual. `[Confirmado por la
  referencia oficial de la API]`

### 2. Retención y contrato

- Activar **retención cero** y apoyarse en el **DPA + SCC** del cloud (AWS/Google) como **encargado del
  tratamiento**; en Bedrock/Vertex el procesador es el cloud, no Anthropic. `[Confirmado]`
- **No** activar el logging de invocación con contenido; si se necesita por soporte, mantenerlo en la UE,
  cifrado con KMS propio y con retención mínima.
- Registrar AWS/Google como **subencargado** en el RoPA; firmar DPA/SCC; valorar BAA si aplica.

### 3. Capas de privacy-by-design (defensa en profundidad, además de la región UE)

1. **Residencia UE de la inferencia** (Bedrock/Vertex EU) — control fundacional.
2. **Minimización de datos:** enviar al modelo solo el contexto mínimo de *ese* residente para *esa* tarea,
   nunca el expediente entero ni datos de otros residentes.
3. **Seudonimización de identificadores directos** antes del prompt cuando sea viable (la AEPD lo recomienda):
   sustituir nombre/DNI/contactos por tokens y rehidratar en local. Compromiso: parte del contexto clínico
   puede necesitar el nombre; como mínimo, **quitar DNI y datos de contacto**.
4. **Tool use, no acceso directo a BD** — ya está (RLS+RBAC+auditoría por `ctx.db`).
5. **Humano en el bucle** obligatorio en toda *herramienta de escritura clínica*: el modelo propone un
   borrador; nada se guarda sin confirmación. Las *herramientas de lectura* (buscar residente, últimos
   registros) pueden correr automáticamente.
6. **AuditLog de cada acción del copiloto** — ya está; añadir distinción "sugerido por IA / aprobado por
   usuario X" en `metadata`.
7. **DPIA (art. 35 RGPD)** antes de producción + transparencia a familias (el tratamiento con IA debe
   constar). Cifrado en tránsito y reposo.
8. **Transcripción de voz:** motor **UE/on-prem** (Whisper auto-hospedado en región UE). Nunca enviar audio
   de salud fuera de la UE. En el MVP la voz queda como stub (A-002); se integra cuando se elija. `[Estimado]`

### 4. AI Act (Reglamento UE 2024/1689)

- **Mantener el copiloto como "asistencia administrativa con humano en el bucle"** → **riesgo limitado /
  obligaciones de transparencia (art. 50)**, no alto riesgo. **Evitar** que cruce a "apoyo a decisión
  clínica" o dispositivo médico (MDR/IVDR), que sería **alto riesgo automático**. `[Estimado/Confirmado]`
- **Transparencia (art. 50) aplica desde el 2 de agosto de 2026:** informar al usuario de que interactúa con
  IA y **marcar el contenido generado** (los borradores de PIA/registros llevan distintivo "borrador IA,
  revisar"). El alto riesgo Annex III se pospuso a 2 dic 2027; el embebido en productos (Annex I) a ago 2028.
  `[Confirmado — digital-strategy.ec.europa.eu, Digital Omnibus]`

## Plan de construcción (`packages/ai`)

1. **`packages/ai`**: clientes (`AnthropicBedrock`/`AnthropicVertex`, región UE), resolución y centralización
   de IDs de modelo, prompts versionados (es/ca), y definición de **herramientas tipadas** (Zod) que reflejan
   los `permissionProcedure` existentes (lectura: residente, registros; escritura: proponer `CareRecord`,
   proponer `CarePlan`).
2. **Bucle de orquestación** server-side con compuerta de aprobación: las herramientas de escritura devuelven
   un *borrador*; el endpoint de confirmación/aprobación ejecuta la mutación real (reutiliza routers actuales).
3. **Capa de privacidad**: minimización + seudonimización antes del prompt; rehidratación local.
4. **AuditLog** del copiloto + distintivo de transparencia (art. 50) en la UI.
5. **Coste**: Haiku para extracción, Sonnet para borradores; prompt caching (−90% input) y batch (−50%) para
   procesos masivos. Estimación previa ~0,30–1 €/plaza/mes (puede haber pequeño premium por hosting cloud-EU,
   asumible frente al ARPU). Aislar el COGS de IA y medirlo con un piloto.
6. **DPIA + RoPA + DPA/SCC** con el cloud antes de producción.

## Consecuencias

- **Se desbloquea H5** con una vía que respeta la residencia UE: el diferimiento tenía una causa real
  (la API 1P no sirve) y ahora tiene solución (Claude en Bedrock/Vertex EU).
- **Dependencia del desempate de despliegue (A-003):** la elección Bedrock vs Vertex debe seguir a dónde
  vayan app+Postgres. Conviene decidir A-003 y este ADR juntos.
- **Sin frontier-lock-in irreversible:** si en el futuro se exige soberanía máxima, Mistral (UE/on-prem) es
  plan B para extracción; el copiloto Sonnet seguiría en cloud-EU.
- **Obligación nueva con fecha:** transparencia art. 50 desde 2 ago 2026 — barata de cumplir si se diseña
  desde el inicio.
- **Pendiente antes de cerrar el ADR (pasar a "Aceptada"):** (a) verificación manual de la lista exacta de
  modelos Claude por región UE en consola Bedrock/Vertex; (b) términos del DPA/SCC (y BAA si aplica) con el
  cloud elegido; (c) decisión de A-003 (proveedor app+Postgres EU).

## Fuentes

platform.claude.com/docs (data-residency, api-and-data-retention, claude-on-vertex-ai) · docs.aws.amazon.com/
bedrock (data-protection, cross-region-inference) · aws.amazon.com/bedrock/faqs · learn.microsoft.com (Foundry
Claude) · digital-strategy.ec.europa.eu (Digital Omnibus AI) · artificialintelligenceact.eu (art. 6, Annex III)
· mistral.ai · referencia oficial de la API de Claude (modelos, precios, tool use, residencia por proveedor).
