# 06 · Dossier ejecutivo — Modelo de negocio de Vetlla (versión exhaustiva)

> Documento integrador de los informes `01`–`05`. Profundiza en dimensionamiento de mercado, competidores,
> unit economics, go-to-market y riesgos. **Fecha: 2026-06-08.** Etiquetas de confianza:
> `[Confirmado]` (fuente directa) · `[Estimado]` (derivado/regla de mercado) · `[Hipótesis]` (apuesta sin
> validar) · `[No confirmado]`. Las fuentes se citan al pie de cada sección.

---

## 0. Resumen para quien tiene 2 minutos

Vetlla es un SaaS cloud-native de gestión sociosanitaria para residencias, con un copiloto de IA agéntica
como diferencial. El análisis encuentra **un hueco real** (el líder no es cloud-native; nadie tiene IA
administrativa) sobre **un dolor confirmado** (personal escaso, papeleo de inspección, calidad obligatoria) en
**un mercado fragmentado** (78% de las camas fuera de los 15 mayores grupos). Pero tres cosas hay que mirar de
frente:

1. **El mercado de *software* es pequeño** (decenas de millones de €/año en España): es un nicho vertical, no
   un océano. Eso está bien para una empresa eficiente; es malo si se esperan retornos de SaaS horizontal.
2. **El diferencial declarado (IA) está diferido** (H5): hoy se compite solo por arquitectura + UX.
3. **La economía es atractiva pero condicional**: todo depende de un **pricing** y un **churn** que aún no se
   han validado con clientes reales.

La recomendación operativa: **validar pricing y adopción con 3–5 pilotos** y **decidir el rumbo de la IA**
antes de invertir en escalar.

---

## 1. El problema y por qué ahora

### 1.1 El dolor del cliente (confirmado)
Una residencia española opera con **margen ajustado** y bajo presión por tres frentes simultáneos:

- **Personal escaso y caro.** ~320.000 trabajadores en residencias en 2024 (+40% desde 2014, 86% mujeres);
  déficit de enfermería (media **109 residentes por enfermera**; salario de convenio ~1.500 € vs ~2.000 € en
  Atención Primaria → fuga de talento); alta rotación y temporalidad. `[Confirmado, 2024-26 — Funcas, Infosalus]`
- **Carga documental e inspección.** PIA con firmas del equipo, registro de medicación (MAR), protocolos e
  indicadores; inspecciones autonómicas a menudo **sin previo aviso**. Problema recurrente y citado por el
  sector: **registros en papel con firmas faltantes o datos incompletos**. `[Confirmado — fuentes sectoriales]`
- **Calidad obligatoria de facto.** Norma **UNE 158101**; Madrid (Orden 2680/2024) la exige a **todas** las
  residencias **antes de noviembre de 2026** como condición de conciertos. `[Confirmado, 2024]`

Encima, **ratios de acreditación al alza**: el Acuerdo del Consejo Territorial (BOE, 28-jul-2022) sube la
ratio de atención directa de **0,31 (fin 2023) a 0,43 (2029)**. Más personal exigido + menos personal
disponible = **cada minuto administrativo ahorrado tiene valor económico directo**. `[Confirmado, 2022]`

### 1.2 Por qué ahora
- **Demografía estructural:** ≥65 pasa de 20,4% a ~30,5% hacia 2055; **≥80 (el más dependiente) de 6,3% en
  2025 a ~11% en 2050**; +1,4 M de >65 entre 2025 y 2030. `[Confirmado — INE, Funcas]`
- **Déficit de plazas:** cobertura ~4,2/100 >65 frente a las 5 que recomienda la OMS; déficit ~75.000 plazas
  hoy, proyección hasta **172.000 camas en 2030** (JLL) → se construirán residencias nuevas, **clientes sin
  software heredado**. `[Confirmado]`
- **Presión normativa de digitalización** (UNE, AI Act, RGPD) que empuja a sustituir el papel.

---

## 2. El mercado: tamaño y forma

### 2.1 Estructura (a junio 2026)
- **~6.002 centros residenciales / 412.109 plazas** (IMSERSO, censo 31-dic-2024). `[Confirmado]`
- **Centros de día: 3.654 / 107.689 plazas.** `[Confirmado]`
- **Facturación del sector (gestión de residencias): 5.650 M€ en 2024** (+6,6%). `[Confirmado — DBK]`
- **Titularidad:** ~75% plazas privadas (≈59% privadas puras, ≈41% concertadas), ~25% públicas. `[Confirmado — DBK]`
- **Fragmentación:** top-5 grupos = 24% del valor, top-10 = 35%; los 15 mayores operadores gestionan ~22% de
  las camas → **~78% de las camas en una larga cola de pequeños e independientes.** `[Confirmado — DBK, PlantaDoce]`

### 2.2 Dimensionamiento del *software* (TAM/SAM/SOM)
> El sector factura miles de millones, pero **el gasto en software de gestión es una fracción mínima**. Lo
> que importa es el mercado de *nuestro* producto, no el del cuidado. Cálculo propio, **`[Estimado]`**.

- **TAM (España, software de gestión sociosanitaria).** ~412.000 plazas residenciales + ~108.000 de centros de
  día ≈ **~520.000 plazas**. A un precio de software de referencia:
  - Ancla baja (estilo GdR, ~2 €/plaza/mes): ~520.000 × 2 × 12 ≈ **~12 M€/año**.
  - Hipótesis de valor (cloud+IA, ~8 €/plaza/mes): ≈ **~50 M€/año**.
  - Premium (~12 €/plaza/mes): ≈ **~75 M€/año**.
  → **TAM realista: ~15–60 M€/año.** Es un **nicho vertical**, no un mercado masivo. `[Estimado]`
- **SAM (servible).** Excluyendo plazas públicas con compra centralizada y grandes grupos con sistemas
  propios/negociación de fuerza, y centrándonos en privados/concertados pequeños-medianos e independientes
  (~la mayoría del 78% fuera del top-15, descontando los ya muy atados al incumbente): **~40–55% del TAM
  ≈ ~6–30 M€/año.** `[Estimado / Hipótesis]`
- **SOM (capturable a 3–5 años).** Para una entrante sin base instalada, capturar **3–8% del SAM** sería un
  resultado fuerte: orden de **~0,3–2 M€ de ARR**. `[Hipótesis]`

**Lectura honesta:** el techo en España es modesto. Tres salidas para que el negocio sea grande, no
excluyentes: (a) **capturar mucha cuota** del nicho siendo claramente mejor; (b) **subir el ARPU** vendiendo
más módulos y la IA como premium (expandir el TAM por valor, no por volumen); (c) **expandir geográficamente**
(otros mercados UE con la misma arquitectura RGPD). El modelo "por plaza/módulo" está diseñado para (b).

---

## 3. Competencia (perfiles)

> Único precio público del mercado: **GdR**. El resto no publica. Arquitectura y posición confirmadas;
> los importes no públicos **no se inventan**.

| Producto (empresa) | Arquitectura | Precio | Posición | Notas |
|---|---|---|---|---|
| **ResiPlus** (ADD Informática) | **Escritorio cliente-servidor** + SaaS atornillado encima | No público | **Líder, +2.750 centros**, >25 años, internacional | El ERP del sector; máxima cobertura funcional; ecosistema de integraciones; **ya colabora en I+D de IA (Verif-AI)** |
| **GdR** (gestionderesidencias.es) | SaaS 100% nube | **59 €/centro + 2 €/residente/mes**, sin permanencia | Secundario, SMB | Único transparente; "todo incluido" simple |
| **GERIGES** | Nube | "Desde 49 €/mes" por usuarios concurrentes + módulos | Secundario/medio | App táctil para auxiliares (GERIGES WS); formación 455 € |
| **Resilife** (NexTReT) | Nube | No público | Medio | Reporting/alertas; usa Kit Digital |
| **Resiges** | **Escritorio Windows** | **Licencia perpetua (compra)** | Nicho | Modelo a evitar/diferenciar (no recurrente) |
| Apps de familias (Ágora, Residencias Transparentes, SeniorClose) | App | Gratis para familia | Complemento | Las contrata el operador; no compiten por plaza |

`[Confirmado, 2026]` salvo importes no públicos.

**IA en el sector:** **ningún competidor de gestión tiene un copiloto de IA agéntica administrativo.** La IA
existente es **visión/sensórica de terceros** para detección de caídas y monitorización (Verif-AI, Medicip+Kepler,
ACCURO.AI, Ibernex) — **ortogonal y combinable, no competidora.** → diferencial de Vetlla libre. `[Confirmado / ausencia de evidencia de lo contrario]`

**El foso del incumbente es el coste de cambio**, no la tecnología: (1) integración con el reporting de cada
administración autonómica; (2) migración de expedientes voluminosos (clínico, farmacológico, PIA, escalas);
(3) formación del personal acostumbrado a un método; (4) ecosistema de integraciones de terceros alrededor de
ResiPlus. **Para una entrante, este foso juega en contra.** `[Confirmado — fuentes sectoriales]`

---

## 4. La propuesta de Vetlla

### 4.1 Qué vende
SaaS cloud-native multitenant + API-first que digitaliza el **bucle de uso diario** (expediente del residente,
atención directa offline en tablet, medicación/MAR con alertas, PIA, portal de familias, AuditLog para RGPD) y
añade un **copiloto de IA agéntica** que automatiza el trabajo administrativo, con **humano siempre en el
bucle** para datos clínicos. El MVP (H0–H4, H6 + AuditLog) está **construido y verificado**; el copiloto (H5)
está **diferido**. `[Confirmado — project_state.yaml]`

### 4.2 Las tres ventajas potenciales (con evidencia) y su límite
1. **Cloud-native real** frente a un líder de escritorio. *Evidencia:* `[Confirmado]`. *Límite:* GdR/GERIGES/
   Resilife ya son nube → la ventaja "cloud" sola es estrecha; el matiz es **multitenant + API-first de verdad**.
2. **Copiloto de IA administrativo** sin competidor directo. *Evidencia:* `[Confirmado]`. *Límite:* **está
   diferido**; ADD ya hace I+D de IA y podría cerrar el hueco.
3. **UX para auxiliares + offline robusto.** *Evidencia:* construido (H3). *Límite:* la adopción del usuario
   (no el comprador) es la que decide el churn, y aún no está probada.

**Honestidad de startup:** estas son **oportunidades**, no fosos. Vetlla aún no tiene base instalada, efectos
de red ni switching cost propio. El foso —cuando llegue— será **ser el system of record** del residente.

### 4.3 Comprador ≠ usuario (tensión de venta)
- **Compra:** dirección/gerencia (le importan coste, cumplimiento, inspección, ahorro de personal, reporting).
- **Usa:** auxiliares (atención directa), sanitarios (medicación/PIA), familias (portal).
- Hay que vender **valor de gestión** a quien firma y **fricción cero** a quien lo usa. Si la dirección compra
  pero el auxiliar no adopta → churn. `[Estimado]`

---

## 5. Unit economics (modelo y escenarios)

> Capa A (economía del cliente) fija el techo de precio; capa B (Vetlla) es casi toda **`[Hipótesis]`**. Se da
> rango y sensibilidad, no falsa precisión. El objetivo no es proyectar, es **decidir qué validar**.

### 5.1 Capa A — la residencia
- Ingreso por plaza: privada **~2.118 €/mes** (2025); concertada **~63–72 €/día**. `[Confirmado, 2025]`
- Coste dominado por personal; margen ajustado; precio topado (privada: techo de ~2.000 €/mes para 2 de cada 3
  familias; concertada: precio/día fijado por la Administración). → **El software se paga de un presupuesto
  pequeño y debe justificarse por ahorro de horas o por evitar incidencias de inspección.** `[Confirmado/Estimado]`
- Centro tipo: **~69 plazas/centro** (412.109 / 6.002). Usamos **50–80**. *Cautela:* la **mediana** es menor
  (muchos centros pequeños); validar antes de dimensionar ARPA. `[Confirmado media / Estimado mediana]`

### 5.2 Capa B — Vetlla (pricing hipótesis: 8 €/plaza/mes base + módulos)
Centro tipo de 65 plazas → **ARPA ≈ 6.240 €/año.** `[Hipótesis]`

| Métrica | Conservador | Base | Optimista |
|---|---|---|---|
| Precio €/plaza/mes | 5 | 8 | 12 |
| ARPA (65 plazas) | 3.900 € | 6.240 € | 9.360 € |
| Gross margin | 68% | 72% | 75% |
| Margen bruto/cuenta | ~2.650 € | ~4.500 € | ~7.000 € |
| CAC (hipótesis) | 4.000 € | 2.500 € | 1.500 € |
| **CAC payback** | ~18 meses | ~7 meses | ~3 meses |
| Churn logo anual | 15% | 12% | 8% |
| Vida media | ~6,7 años | ~8,3 años | ~12,5 años |
| **LTV** | ~17.700 € | ~37.400 € | ~87.500 € |
| **LTV : CAC** | ~4,4 : 1 | ~15 : 1 | ~58 : 1 |

`[Hipótesis]` — modelo ilustrativo; cifras redondeadas.

**Lectura:** incluso el **escenario conservador supera el 3:1** de referencia. Pero el resultado es
**estructuralmente sensible al churn y al precio**, que son justo lo no validado. El modelo demuestra una cosa
útil: *si* Vetlla logra retención de vertical-system-of-record con un precio ≥5 €/plaza, la economía funciona;
no demuestra que el negocio ya funcione.

### 5.3 COGS de IA (por qué no asusta al margen)
Claude **Haiku** $1/$5 y **Sonnet** $3/$15 por millón de tokens, con **prompt caching** (−90% input) y **batch**
(−50%). Dirigir extracción/clasificación a Haiku y reservar Sonnet para el copiloto razonado deja el
cost-to-serve estimado en **~0,30–1 €/plaza/mes** (4–12% de un ARPU de 8 €). `[Confirmado pricing Anthropic 2026 / Estimado uso]`
→ El golpe de gross margin de la IA (12–17 pts según ICONIQ) es **gestionable** con routing + caching; por eso
modelamos margen ~70–75%, no 85%.

### 5.4 Caja
SaaS B2B cobra por adelantado (anual) → caja favorable **una vez hay clientes**. Antes, el negocio **quema
caja** en producto + ventas durante un ciclo de venta largo (sector salud ~14,7 meses de media). La métrica
crítica de supervivencia es **cuántos pilotos se convierten y en cuánto tiempo**. `[Confirmado ciclo — HSA 2024]`

---

## 6. Go-to-market (hipótesis a validar)

- **Beachhead recomendado:** **centros pequeños/medianos independientes y residencias de nueva apertura** —la
  cola del 78% fuera del top-15, con menos lock-in y más dolor de papel/escritorio. Evitar de inicio los
  grandes grupos (sistemas propios, ventas largas) y lo público (compra centralizada). `[Hipótesis]`
- **Cuña de entrada:** neutralizar el foso del incumbente desde el día 1 →
  1. **Migración asistida** (idealmente con la propia IA de extracción, p. ej. Haiku) para bajar el coste de
     cambio.
  2. **Reporting autonómico nativo** (lo que retiene a los clientes del incumbente).
  3. **Onboarding "en minutos"** + UX para auxiliares para neutralizar el coste de formación.
- **Palanca financiera:** **Kit Digital** (ya usado por GdR, ResiPlus, Resilife) reduce la barrera económica
  de entrada del cliente. `[Confirmado]`
- **Pricing como arma:** **transparencia** (hoy rara: solo GdR publica) + modelo **sin permanencia** para bajar
  el riesgo percibido. Posicionar por valor por encima del ancla de GdR. `[Hipótesis]`
- **Confianza:** referencias, RGPD/UE demostrable, y "cumplimiento como producto" (UNE 158101, conciertos) como
  argumento de venta a dirección.

---

## 7. Registro de riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Diferencial de IA diferido** → se compite en terreno igualable | Alta | Alto | Decidir Q-001: reactivar H5 o reposicionar relato |
| R2 | **Pricing real < hipótesis** (presupuesto pequeño del cliente) | Media | Alto | Validar con pilotos; vender ahorro de horas/cumplimiento, no IT |
| R3 | **Churn alto** por no-adopción del auxiliar | Media | Alto | UX a pie de cama; medir usuarios activos/centro como early-warning |
| R4 | **Lock-in del incumbente** frena la sustitución | Alta | Medio | Migración asistida + reporting autonómico + onboarding rápido |
| R5 | **ADD/ResiPlus cierra el hueco** (cloud o IA) | Media | Alto | Velocidad; ser system of record antes; profundidad de IA agéntica |
| R6 | **TAM pequeño** en España | Confirmada | Medio | Subir ARPU por módulos/IA; expansión UE |
| R7 | **Regulación de la IA** (AI Act alto riesgo salud, AEPD) encarece/retrasa | Media | Medio | RGPD-first + humano en el bucle ya en el diseño; datos UE |
| R8 | **Ciclo de venta largo** quema caja antes de tracción | Alta | Alto | Beachhead de decisión rápida; Kit Digital; controlar burn |
| R9 | **Dependencia de lo público** (presupuesto/conciertos) | Media | Medio | Empezar por privado/concertado pequeño |

---

## 8. La decisión que lo condiciona todo: el diferencial de IA (preludio a H5)

**Palabras vs. actos.** El spec vende la IA agéntica como *el* diferencial; el `project_state.yaml` la tiene
**diferida** (H5), por decisión de 2026-06-07: *"no se usará API key de Anthropic por ahora; pendiente decidir
modelo (UE/coste/capacidad)"*. La arquitectura ya está preparada (tool use sobre los routers tRPC tipados que
respetan RLS/rol/tenant); falta `packages/ai` (tools + prompts + SDK) + endpoints de confirmación/aprobación +
AuditLog. `[Confirmado — project_state.yaml]`

**Las dos rutas (Q-001):**
- **(A) Reactivar H5:** construir el copiloto → materializa el diferencial y abre pricing premium + expansión
  por módulos (NRR >100%). Coste: decidir modelo con despliegue/residencia UE, asumir COGS variable y cumplir
  AI Act/AEPD. *Tiene que ser verdad:* que la IA aporte un ahorro de tiempo **evidente y medible**.
- **(B) Reposicionar el relato:** "cloud + cumplimiento ahora, IA en roadmap" → honesto con el estado real,
  reduce riesgo regulatorio y de coste a corto, pero **renuncia temporalmente al diferencial** y deja a Vetlla
  compitiendo donde otros ya están.

No son excluyentes en el tiempo: se puede hacer **B ahora y A en 6–12 meses**. La elección depende de tres
cosas que conviene cerrar en la sesión de H5: **(i)** disponibilidad de un modelo con garantías UE a coste
asumible; **(ii)** si el comprador realmente *paga* por IA o compra cloud+cumplimiento y la IA es "nice to
have" (R2/validación); **(iii)** cuánto adelanto sobre ADD compra construirla ya.

→ *Esto es lo que desarrollaremos en el análisis detallado de H5.*

---

## 9. Conclusión y siguientes pasos

**Tesis:** hay un hueco real y un dolor confirmado en un nicho vertical fragmentado. La arquitectura de Vetlla
encaja y la economía, *condicionalmente*, es atractiva. **Los dos cuellos de botella no son técnicos sino de
negocio:** validar **pricing/adopción** y decidir el **rumbo de la IA**.

**Siguientes pasos recomendados (orden):**
1. **Validar con 3–5 pilotos** precio por plaza y adopción del auxiliar (Q-002). Es lo que más mueve el modelo.
2. **Decidir Q-001** (reactivar H5 vs. reposicionar) — sesión específica de H5 a continuación.
3. **Definir beachhead explícito** y construir la cuña anti-lock-in (migración + reporting autonómico + onboarding).
4. **Vigilar 5 KPIs:** precio efectivo €/plaza, CAC y ciclo reales, churn logo y NRR, gross margin con IA
   encendida, usuarios activos/centro.

---

### Fuentes (consolidado)
IMSERSO (censo dic-2024) · INE (proyecciones 2024-2074) · DBK/Informa (2024-2025) · CSIC Envejecimiento en Red
· JLL · Funcas · Infosalus/El Español (personal/enfermería) · BOE-A-2022-13580 (Acuerdo de acreditación) · BOJA
152/2025 · Orden 2680/2024 Madrid (UNE 158101) · AEPD (RGPD/IA agéntica) · Alimarket / Dependencia.info
(precios de plaza) · PlantaDoce (operadores) · webs oficiales de GdR, ADD/ResiPlus, GERIGES, Resiges, Resilife ·
GVA/Verif-AI · Anthropic (precios de modelos) · KeyBanc 2024, Bessemer, ICONIQ 2026, ChartMogul, a16z
(benchmarks SaaS) · `docs/mercado/2026-06-07-estudio-competencia.md`. Detalle por dato en los informes `01`–`05`
y en los paquetes de investigación de junio 2026.
