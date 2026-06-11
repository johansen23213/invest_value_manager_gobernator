# 05 · Contradiction Check — Dónde se contradicen los informes y qué creer

> Paso final del framework: leer los cuatro informes juntos y listar cada punto donde se contradicen entre
> sí, con la evidencia, o donde un dato es frágil. Para cada uno: **qué fuente creer** y **qué validar**.

---

## A. Contradicciones de datos (entre fuentes)

1. **Número de residencias y plazas.** IMSERSO censo dic-2024: **6.002 centros / 412.109 plazas**. DBK 2024:
   ~5.600 / ~397.000. Censo oficial 2022: 5.188 / 381.514. CSIC 2022: 5.573 / 393.581.
   → **Creer:** IMSERSO dic-2024 como cifra oficial más reciente para *tamaño*; **DBK** para *estructura
   económica y titularidad*. La divergencia es real (no hay registro único) y está documentada, no es un error.

2. **% de plazas privadas.** DBK ~75%; prensa "77%"; censo "~74% privada, sólo ~14% íntegramente públicas".
   → **Creer:** banda **74–77% privadas**. La diferencia "privada gestionada" vs "íntegramente pública"
   explica el matiz del 14%. No afecta a la tesis (mercado mayoritariamente privado y fragmentado).

3. **Precios de plaza concertada por CCAA.** Sólo Andalucía confirmada al detalle (**63,66 €/día**, BOJA
   2025); Madrid (~72 €) y Cataluña (~67 €) son estimaciones de prensa.
   → **Creer:** Andalucía como dato firme; el resto **`[Estimado]`**. **Validar** con el cuadro de
   Inforesidencias/CCOO (bloqueado al scraping) antes de usarlo en material serio.

4. **Pricing de competidores.** Sólo **GdR es público** (59 €/centro + 2 €/residente/mes). ResiPlus,
   Resilife, Resiges **no publican precio**; GERIGES "desde 49 €/mes".
   → **Creer:** GdR como único ancla real. **No inventar** el precio de ResiPlus; la afirmación de `03` de que
   el líder ronda "decenas de €/plaza" es **`[Estimado]`**, no dato.

## B. Tensiones internas (entre nuestros propios informes/decisiones)

5. **El diferencial declarado vs. el producto real.** `02`/`04` lo dicen claro: CLAUDE.md vende la **IA
   agéntica** como diferencial, pero `project_state.yaml` tiene **H5 (IA) diferido**. → **Contradicción
   estratégica real**, no de datos. Es la más importante del documento. **Decisión pendiente del fundador:**
   reactivar la IA o reposicionar el relato a "cloud + cumplimiento ahora, IA en roadmap".

6. **"No competimos por completitud funcional" vs. la realidad del lock-in.** El spec dice no competir en
   features; pero `01`/`05` muestran que el foso del incumbente es precisamente la **cobertura + integración
   autonómica + migración**. → No es contradicción lógica, pero **sí un riesgo**: para *entrar* hay que cubrir
   un mínimo funcional (reporting autonómico, migración) aunque la *tesis* no sea completitud. Matizar el
   discurso: "no más features que nadie, pero sí las imprescindibles para sustituir y cumplir".

7. **LTV:CAC ~14:1 (`03`) vs. honestidad de startup (`02` §7).** El modelo da una economía brillante, pero
   `02` admite que Vetlla **no tiene ventajas probadas**. → No es contradicción si se lee bien: el 14:1 es
   **condicional** a una retención que aún no existe. **Creer:** el aviso de `03` — el modelo dice "si la
   retención es de vertical, la economía es atractiva", no "el negocio ya funciona".

## C. Datos frágiles a reforzar (sin contradicción, pero poco sustentados)

8. **Coste de servir la IA por plaza** (`03`): estimación gruesa `[Estimado]`. **Validar** con un piloto real
   midiendo tokens/plaza con el copiloto encendido.
9. **CAC y ciclo de venta** (`03`): tomados de benchmarks de salud, no de datos propios. **Validar** con los
   primeros 3–5 ciclos comerciales.
10. **Tamaño de centro tipo** (65 plazas): media aritmética IMSERSO; la distribución real está sesgada (muchos
    centros pequeños). **Validar** la mediana, no sólo la media, para dimensionar ARPA.

## D. Qué fuente creer, en una tabla

| Tema | Fuente a creer | Confianza |
|---|---|---|
| Tamaño del sector | IMSERSO dic-2024 | Alta |
| Estructura económica/titularidad | DBK 2024-2025 | Alta |
| Demografía | INE 2024-2074 | Alta |
| Precio plaza privada | Alimarket 2025 | Alta |
| Precio concertada | BOJA (Andalucía); resto estimado | Media |
| Pricing competidores | GdR (público); resto no público | Baja salvo GdR |
| Arquitectura ResiPlus (escritorio) | Web ADD + FAQ | Alta |
| Ausencia de copiloto IA rival | Búsqueda (ausencia de evidencia) | Media |
| Unit economics Vetlla | Hipótesis propias | Baja (a validar) |

---

## Veredicto

Los informes **no se contradicen en la tesis de mercado**: hay un hueco real (líder no cloud-native, IA
administrativa libre, dolor de personal y cumplimiento confirmado). Las contradicciones relevantes son **dos
internas y estratégicas**, no de datos:

1. **El diferencial estrella (IA) está diferido** → palabras vs. actos a resolver.
2. **La economía es atractiva sólo de forma condicional** → todo pende de **pricing real** y **churn/adopción
   real**, aún sin probar.

**Lo más accionable:** dejar de discutir el modelo en abstracto y **validar con 3–5 centros piloto** las dos
incógnitas que mueven todo (precio por plaza y adopción del auxiliar), y **decidir el rumbo de la IA**
(reactivar H5 o reposicionar el relato).

**Fecha que refleja:** junio 2026.
