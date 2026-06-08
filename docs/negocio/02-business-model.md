# 02 · Business Model — Qué vende Vetlla, a quién y por qué comprarían

> Lee `01-sector-map.md` antes. Aquí no analizamos a otro: **articulamos el modelo de Vetlla** y lo
> presionamos contra la evidencia. Refleja junio 2026. Etiquetas: `[Confirmado] [Estimado] [Hipótesis]`.

---

## 1. Qué hace Vetlla, en una frase

Un **SaaS cloud-native** que digitaliza la gestión sociosanitaria de una residencia (expediente del
residente, atención directa a pie de cama, medicación/MAR, PIA, familias) y le añade un **copiloto de IA
agéntica** que automatiza el trabajo administrativo, con el humano siempre en el bucle. `[Hipótesis de producto]`

El problema que resuelve está confirmado por el sector (`01` §6): **personal escaso y caro** + **carga
documental e inspección** + **calidad obligatoria (UNE 158101)** + **registros aún en papel**. Vetlla
ataca el coste de tiempo administrativo y el riesgo de cumplimiento.

## 2. Qué vende y qué módulos importan

Módulos del MVP (ya construidos, ver `project_state.yaml`): multitenancy+RBAC, centros/plazas/ocupación,
expediente del residente + escalas, **atención directa offline en tablet**, **medicación + MAR con alertas**,
**PIA**, **portal de familias**, AuditLog (RGPD). Diferido: **copiloto de IA** (H5).

Los que más pesan en la propuesta de valor frente al sector:
- **Atención directa a pie de cama, offline-first** → ataca el dolor del personal (pocos toques, sin red).
- **MAR + PIA con trazabilidad y firmas** → ataca inspección y UNE 158101.
- **Copiloto de IA** (cuando se active) → el diferencial sin competidor directo (ver §7).

## 3. Quién paga y quién usa (¡no son el mismo!)

- **Compra:** dirección/gerencia del centro o grupo. Le importan coste, cumplimiento, inspección, ahorro de
  personal y reporting autonómico.
- **Usan:** auxiliares/gerocultores (atención directa), sanitarios (medicación, PIA), y de forma indirecta
  las **familias** (portal). El comprador no es el usuario diario → hay que vender *valor de gestión* a quien
  firma y *valor de fricción cero* a quien lo usa. `[Estimado]` Es una tensión clásica de B2B vertical.
- **Por qué comprarían vs. el líder:** cloud real (cero instalación, alta en minutos), API-first, UX para
  auxiliares, offline que funciona y —diferencial— IA útil. Frente a un ResiPlus anclado en escritorio
  cliente-servidor (`01`, `05`).

## 4. Cómo hace dinero

**Suscripción SaaS recurrente, por plaza + por módulo.** `[Hipótesis confirmada como dirección de
producto en CLAUDE.md]` El modelo de datos ya soporta pricing por plaza/módulo.

- **Mueve los ingresos:** nº de plazas contratadas × precio/plaza, nº de centros, módulos activados
  (expansión), y retención. Palancas de crecimiento: nuevos centros + más módulos por centro (NRR) + más
  plazas por centro.
- **Ancla de mercado (única pública):** **GdR cobra 59 €/centro/mes + 2 €/residente/mes**, SaaS sin
  permanencia. `[Confirmado, 2026]` El resto (ResiPlus, Resilife, Resiges) no publica precio; GERIGES
  "desde 49 €/mes" por usuarios concurrentes. → Vetlla puede posicionarse **por valor por encima del ancla
  de GdR** (cloud+IA), con **transparencia de precio** como argumento (hoy rara en el sector).

## 5. Estructura de costes

- **COGS:** infraestructura cloud (UE) + **coste de servir la IA** (tokens). La IA es un COGS *variable*
  real: con Claude Haiku a $1/$5 por millón de tokens (extracción/clasificación) y Sonnet a $3/$15
  (copiloto), más prompt caching (−90% input) y batch (−50%), el cost-to-serve por plaza debería ser bajo
  frente al precio. `[Confirmado pricing Anthropic, 2026]` (cuantificado en `03`).
- **Opex:** desarrollo, **ventas y soporte** (caras en sector conservador), cumplimiento (RGPD/UE, auditoría).
- **Gross margin esperado:** SaaS puro 70–80%, pero añadir IA recorta 12–17 pts → modelar **~70–75%** con el
  COGS de IA aislado. `[Estimado, ICONIQ 2026]`

## 6. Dónde se sitúa vs. competidores

| Eje | Mercado | Vetlla |
|---|---|---|
| Arquitectura | Líder (ResiPlus, +2.750 centros) **escritorio cliente-servidor** + SaaS atornillado; GdR/GERIGES/Resilife SaaS pero no necesariamente multitenant cloud-native | **Cloud-native multitenant, API-first** |
| IA | Sólo **visión/sensórica** de terceros (caídas): Verif-AI, Medicip, ACCURO.AI, Ibernex | **Copiloto agéntico administrativo** (sin competidor directo) |
| UX auxiliar / offline | Apps de registro existen (SeniorClose, GERIGES WS) | **Offline-first robusto + pocos toques** |
| Precio | Opaco; sólo GdR público | **Por plaza/módulo, transparente** `[Hipótesis]` |
| Familias | Resuelto por muchos (no diferencia) | Nativo, no app aparte |

`[Confirmado, 2026]` salvo lo marcado.

## 7. Ventajas reales (sólo las que tienen evidencia)

- **Hueco técnico real:** el líder NO es cloud-native; está confirmado que ResiPlus mantiene base de
  escritorio. `[Confirmado]`
- **Diferencial de IA sin competidor directo:** ningún competidor de gestión tiene copiloto agéntico
  administrativo; la IA del sector es visión/sensórica, ortogonal y combinable. `[Confirmado / No confirmado
  que exista lo contrario]`
- **Honestidad necesaria:** como startup pre-ingresos, Vetlla **aún no tiene ventajas *probadas*** (ni base
  instalada, ni efectos de red, ni switching cost propio). Las de arriba son **oportunidades**, no fosos.
  El foso —cuando llegue— será *ser el system of record* del residente (alto coste de cambio), igual que hoy
  protege al incumbente.

## 8. Qué puede debilitar el modelo

- **El incumbente:** cobertura funcional enorme + base instalada + **lock-in** (integración autonómica,
  migración de expedientes, formación, ecosistema de integraciones). Es su mayor defensa. `[Confirmado]`
  Además **ADD ya colabora en I+D de IA** (Verif-AI) → podría cerrar el hueco de IA.
- **Comprador conservador, ciclo de venta largo** (sector regulado/salud: media ~14,7 meses; ver `03`).
- **Presupuesto pequeño del cliente** (margen ajustado de la residencia): techo de precio.
- **Comprador ≠ usuario:** si la dirección compra pero los auxiliares no lo adoptan, hay churn.
- **Riesgo regulatorio sobre la propia IA** (AI Act alto riesgo en salud, AEPD): cumplir es coste y barrera,
  aunque también es defendible si se hace bien (RGPD-first ya es principio del producto).
- **Que el diferencial declarado (IA) esté diferido** (H5) → a corto, Vetlla compite sólo por
  arquitectura+UX, terreno más fácil de igualar (ver `04` y `05`).

---

## Cierre

- **Cómo hace dinero (una frase):** suscripción recurrente por plaza + módulos a residencias, vendiendo
  ahorro de tiempo de personal y cumplimiento, con cloud-native + IA como diferencial.
- **5 ideas clave:** (1) el dolor del cliente está confirmado (personal + papeleo + UNE 158101);
  (2) el líder no es cloud-native → hueco técnico real; (3) nadie tiene copiloto administrativo → diferencial
  de IA libre; (4) el único precio público (GdR ~2 €/residente/mes) es un ancla baja: Vetlla debe vender
  valor por encima; (5) el foso del sector es el coste de cambio, que hoy juega *contra* el entrante.
- **5 preguntas a responder antes de profundizar:**
  1. ¿Cuánto está dispuesta a pagar por plaza/mes una residencia, y de qué partida sale?
  2. ¿El comprador valora la IA, o compra cloud+cumplimiento y la IA es "nice to have"?
  3. ¿Podemos neutralizar el lock-in del incumbente (migración asistida + reporting autonómico nativo)?
  4. ¿Cuál es el beachhead: centros nuevos, pequeños independientes, o descontentos del escritorio?
  5. Con la IA diferida, ¿el diferencial a corto aguanta frente a los SaaS ya existentes (GdR, GERIGES)?
- **Fecha que refleja:** junio 2026.

**Fuentes:** webs oficiales de competidores (GdR pricing, ResiPlus, GERIGES, Resiges, Resilife),
SoftwareDOIT, GVA/Verif-AI, documentación de precios de Anthropic, ICONIQ 2026, y
`docs/mercado/2026-06-07-estudio-competencia.md`.
