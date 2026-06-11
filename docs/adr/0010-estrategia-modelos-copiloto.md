# ADR 0010 — Estrategia de modelos del Copiloto (H5): open-source soberano vs gestionado

- **Estado:** Aceptada (estrategia). Implementación por fases; decisiones de proveedor/modelo concretos abiertas (ligadas a A-003).
- **Fecha:** 2026-06-09
- **Relacionado:** **enmienda ADR-0008** (que asumía Claude gestionado como vía única),
  principios de producto (datos de salud en la UE, humano en el bucle, IA como
  diferencial), `packages/ai`, Q-001, A-003. Decidido con Angel.

## Contexto

ADR-0008 resolvió la incógnita técnica _"qué modelo Claude usar respetando residencia
UE"_ → Claude vía AWS Bedrock (Fráncfort) o Google Vertex (endpoint EU). Al reactivar
H5, Angel plantea una alternativa de mayor soberanía: **LLM open-source potentes,
auto-alojados** en un hyperscaler o servidores de la app, en la UE. Este ADR fija la
estrategia de modelos del copiloto y los casos de uso, enmendando ADR-0008.

## Decisión

1. **`packages/ai` provider-agnóstico (fundación, innegociable).** Interfaz
   `ModelProvider` que abstrae el motor; registro de IDs por proveedor resuelto por
   entorno; `StubProvider` determinista para dev/tests sin GPU ni clave. Esto hace
   la elección de modelo **reversible y medible**, y permite **mezclar** modelos por
   tarea. El diferencial es la **UX del copiloto + el flujo humano-en-el-bucle**, no el
   modelo concreto.

2. **Liderar con open-source auto-alojado en la UE.** Modelos open-weight (candidatos:
   **Mistral/Mixtral** —empresa europea—, Llama, Qwen) servidos con **vLLM/TGI** sobre
   GPU en **cloud EU-soberano** (candidatos: OVHcloud, Scaleway, Hetzner). Motiva:
   soberanía RGPD máxima (los datos **no salen de nuestra infraestructura**, ni a
   Anthropic ni a terceros), sin lock-in, fine-tuning posible en es/ca sociosanitario, y
   una narrativa de venta fuerte al sector público/social (_"IA 100% europea"_).

3. **Medir y enrutar por feature.** Benchmark de las 2 features sobre prompts reales
   es/ca. **Extracción/clasificación** (frase→`CareRecord`) → open-source (suficiente).
   **Razonamiento** (borrador de PIA) → open-source si la calidad llega; si no, la
   abstracción permite **enrutar solo esa feature a Claude-UE (Bedrock/Vertex)** como
   fallback, sin reescribir nada.

4. **Atar A-003 a un proveedor EU** para que app + Postgres + GPU vivan juntos → stack
   coherente "todo en la UE, mayoritariamente open-weight".

5. **Voz:** Whisper auto-alojado en UE (coherente con la estrategia; ver A-002).

## Casos de uso del LLM (alcance del copiloto)

Tesis: el LLM convierte la realidad desordenada de la atención (voz, texto libre,
papeles) en **datos estructurados, conformes y consultables** — y de vuelta en
**documentos legibles** — siempre con **humano confirmando**. El valor se concentra en
**devolver tiempo al personal escaso** (dolor confirmado del sector).

| #   | Categoría                   | Ejemplos                                                                                                             | Tier                   | Estado               |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------- |
| 1   | **Capturar sin teclear**    | voz/texto→`CareRecord`; receta/informe (foto/PDF)→prescripción/expediente; transcripción Whisper                     | extracción (barato)    | **MVP f1** + roadmap |
| 2   | **Redactar borradores**     | PIA/PAI; evolutivos y notas de turno; comunicaciones a familias; documentación de inspección (UNE 158101)            | razonamiento           | **MVP f2** + roadmap |
| 3   | **Resumir/sintetizar**      | relevo de turno; resumen de expediente; briefing de dirección; novedades para el portal                              | razonamiento           | roadmap              |
| 4   | **Q&A sobre datos propios** | consultas en lenguaje natural vía **herramientas tipadas** (rol/tenant/RLS); asistente de procedimientos con fuentes | razonamiento           | roadmap              |
| 5   | **Clasificar/señalar**      | gravedad de incidencias; huecos documentales; señales en texto libre (sugerir revisión); chequeo alergia/interacción | clasificación (barato) | roadmap              |
| 6   | **Calidad de datos**        | normalizar texto libre a catálogos; conciliar duplicados; traducción es↔ca                                           | extracción             | roadmap              |

### 🚫 Línea roja (AI Act + principio de producto)

Nada de **diagnóstico autónomo, decisión clínica/medicación sin humano, ni triaje
autónomo**. La IA **propone, extrae y resume; el profesional decide y confirma.** Mantiene
_"riesgo limitado + transparencia"_ (art. 50), evita el "alto riesgo" de apoyo a decisión
clínica. El modelo **nunca toca la BD**: llama herramientas tipadas que validan rol,
tenant y RLS. Cada acción del copiloto queda en `AuditLog`. Nada de PII de salud sale de
la UE.

## Consecuencias

- **Enmienda ADR-0008:** Claude gestionado en UE deja de ser la vía única; pasa a ser un
  **fallback/ruta** para razonamiento de alta exigencia, detrás de la misma interfaz.
- Actualiza la línea de IA del `CLAUDE.md` (de "SDK de Anthropic" a "provider-agnóstico;
  lidera open-source UE; Claude-UE como fallback").
- **Decisiones abiertas:** modelo open-source concreto + proveedor EU + cuándo
  aprovisionar GPU (validar features con `StubProvider`/GPU pequeña antes de comprometer
  GPU grande); todo ligado a A-003. DPA/SCC solo si se usa el fallback gestionado.
- **Construcción:** empieza por el Slice 1 (fundación `@vetlla/ai` provider-agnóstica,
  testeable sin modelo), luego features 1 y 2, luego cableado del proveedor real.
