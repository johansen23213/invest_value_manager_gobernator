# 03 · Economics Engine — Qué mueve crecimiento, márgenes y caja

> Lee `01` y `02` antes. **Dos capas:** (A) la economía del cliente (la residencia), que fija nuestro techo
> de precio; (B) los unit economics de Vetlla. Casi todo en (B) es **`[Hipótesis]`** —es una startup
> pre-ingresos—; se etiqueta con honestidad y se da rango + sensibilidad, no falsa precisión.

---

## Capa A — La economía del cliente (la residencia)

Determina cuánto puede pagar por nuestro software.

- **Ingreso por plaza:** privada **~2.118 €/mes** (2025); concertada **~63–72 €/día** que paga la
  Administración (~1.900–2.160 €/mes) + copago. `[Confirmado, 2025]`
- **Estructura de coste de la residencia:** dominada por **personal** (sector intensivo en mano de obra, con
  ratios al alza 0,31→0,43 y escasez que encarece). Margen ajustado. `[Confirmado]`
- **Implicación para nuestro pricing:** el software se paga de un presupuesto pequeño y debe justificarse por
  **ahorro de horas de personal** o **reducción de riesgo de inspección/sanción**, no como gasto de IT.
  Regla mental: si Vetlla ahorra ~15–30 min/día de tareas administrativas a un puñado de trabajadores, o
  evita una incidencia de inspección, el coste de la suscripción queda holgadamente justificado. `[Estimado]`
- **Tamaño típico de cuenta:** una residencia media española ronda **~70–80 plazas** `[Estimado]` (412.109
  plazas / ~6.002 centros ≈ 69 plazas/centro `[Confirmado, IMSERSO dic-2024]`). Usaremos **50–80 plazas**
  como centro tipo.

## Capa B — Unit economics de Vetlla

### Pricing (hipótesis de trabajo)

Ancla pública del mercado: **GdR = 59 €/centro/mes + 2 €/residente/mes** `[Confirmado]`. Es un precio
*básico*. Vetlla aspira a vender más valor (cloud-native + offline + IA), así que la hipótesis es
posicionarse **por encima del ancla**:

- **Hipótesis base:** **8 €/plaza/mes** (paquete núcleo) + módulos premium (p. ej. copiloto IA) como
  add-on. `[Hipótesis]`
- Centro tipo de **65 plazas** → **ARPA ≈ 520 €/mes ≈ 6.240 €/año** por cuenta. `[Hipótesis]`
- Sensibilidad: a 5 €/plaza → 3.900 €/año; a 12 €/plaza → 9.360 €/año.

> *Esto es lo más incierto del modelo y la primera hipótesis a validar con clientes reales (ver `02`,
> pregunta 1). Todo lo que sigue depende de este número.*

### Coste de servir (COGS)

- **Infra cloud (UE):** bajo y compartido (multitenant). `[Estimado]`
- **IA (variable):** Haiku $1/$5 y Sonnet $3/$15 por millón de tokens, con caching (−90% input) y batch
  (−50%). `[Confirmado, Anthropic 2026]` Estimación gruesa de cost-to-serve del copiloto: **~0,30–1 €/plaza/mes**
  según intensidad de uso. `[Estimado]` → sobre un ARPU de 8 €/plaza, la IA es un 4–12% del precio.
- **Gross margin objetivo: ~70–75%** (SaaS puro 70–80%, −12–17 pts por IA; mitigable con routing a Haiku +
  caching). `[Estimado, ICONIQ 2026]`

### Adquisición y retención

- **CAC:** venta B2B consultiva a sector conservador (demo + formación). Sin dato propio; **hipótesis
  1.500–4.000 €/centro** según canal. `[Hipótesis]`
- **Ciclo de venta:** software a salud/regulado ~**14,7 meses** de media (rango: clínica pequeña 60–90 días,
  EHR hospitalario ~2 años). Para residencias pequeñas, modelar **6–12+ meses**. `[Confirmado, HSA 2024]`
- **Churn:** SaaS PYME tiene churn alto (3–7%/mes), pero el **vertical / system of record retiene mucho
  mejor**. Hipótesis prudente: **churn logo anual ~10–15%** hasta tener datos. `[Estimado]`
- **NRR:** objetivo **>100%** vía expansión por módulos y más plazas; referencia SMB ~97%, mid-market ~118%.
  `[Confirmado por segmento]`

### Modelo ilustrativo (centro tipo 65 plazas, pricing base 8 €/plaza) `[Hipótesis]`

| Métrica | Valor | Nota |
|---|---|---|
| ARPA | 6.240 €/año | 65 × 8 € × 12 |
| Gross margin | 72% | COGS infra + IA |
| Margen bruto/cuenta | ~4.500 €/año | |
| CAC | 2.500 € (punto medio) | hipótesis |
| **CAC payback** | **~7 meses** (sobre margen bruto) | sano (<12) |
| Vida media (churn 12%/año) | ~8 años | vertical/system of record |
| **LTV** (margen bruto × vida) | **~36.000 €** | |
| **LTV : CAC** | **~14:1** | *muy* por encima de 3:1 |

> **Lectura honesta:** el LTV:CAC sale brillante *porque* el churn supuesto es bajo y la vida larga —
> exactamente lo que **aún no está probado**. El modelo no demuestra que el negocio funcione; demuestra que
> **si** Vetlla logra retención de vertical-system-of-record con ese pricing, la economía es muy atractiva.
> Las dos palancas que lo hacen o lo rompen: **pricing real** y **churn real**. Ambas se validan con clientes.

## Cash y ciclicidad

- **Working capital:** SaaS B2B suele cobrar por adelantado (anual) → caja favorable una vez hay clientes.
  Antes de eso, **el negocio quema caja** en producto + ventas durante un ciclo de venta largo. `[Estimado]`
- **Ciclicidad:** demanda del sector **anticíclica/estructural** (envejecimiento), poco sensible a recesión;
  el riesgo no es la demanda de plazas sino el **presupuesto público** y la velocidad de adopción.

## KPIs a vigilar (próximos 12–24 meses)

1. **Precio efectivo por plaza/mes** cerrado con los primeros clientes (valida toda la capa B).
2. **CAC y ciclo de venta reales** por canal.
3. **Churn logo y NRR** una vez haya base.
4. **Gross margin con IA encendida** (coste real de tokens por plaza).
5. **Adopción por el usuario** (auxiliares activos/centro): predice el churn antes de que ocurra.

---

## Cierre

- **Top-3 drivers de crecimiento:** nuevos centros · expansión por módulos (NRR) · pricing por plaza.
- **Top-3 drivers de margen:** multitenancy (infra compartida) · routing Haiku+caching (COGS de IA) ·
  cobro anual anticipado.
- **Top-3 riesgos:** pricing real por debajo de la hipótesis · churn real alto si no hay adopción ·
  CAC/ciclo de venta largos que retrasan el payback y queman caja.
- **5 indicadores a vigilar:** los KPIs de arriba.
- **Fecha que refleja:** junio 2026.

**Fuentes:** IMSERSO (plazas/centro), Alimarket/Dependencia.info (precios de plaza), KeyBanc 2024 (payback),
ICONIQ 2026 (margen IA), ChartMogul/SaaS Capital (churn/NRR), HSA 2024 (ciclo de venta salud), precios
oficiales de Anthropic (COGS IA). Cifras de la capa B etiquetadas `[Hipótesis]`/`[Estimado]`: **no son
proyecciones financieras, son un marco para decidir qué validar.**
