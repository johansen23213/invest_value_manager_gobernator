# PLAN DE MEJORA SISTÉMICA — Quiniela Pipeline v2
## Más allá de mejoras incrementales jornada a jornada

---

## 1. DATOS HISTÓRICOS (bloqueador principal)

### Problema
Sin histórico de goles partido a partido (últimas 15-20 jornadas), el Poisson usa proxies (posición→lambda) en vez de datos reales. Esto limita el Brier a ~0.52 como mínimo.

### Solución
- **Opción A**: Ejecutar `laliga_stats.py jornada N` desde un entorno con IP no bloqueada por FotMob (local, VPS, Colab). Un solo run con cache guarda toda la liga.
- **Opción B**: Script dedicado que parsee resultados de WebSearch jornada a jornada (lento pero funciona).
- **Opción C**: Fuente alternativa — la RFEF publica PDFs con todos los resultados. Parser de PDF.
- **Impacto**: Brier estimado pasa de 0.52 a <0.48 con lambdas reales.

### Formato necesario
```json
{"jornada": 33, "matches": [
  {"home": "Athletic Club", "away": "Osasuna", "home_goals": 1, "away_goals": 0, "home_id": 1, "away_id": 2},
  ...
]}
```
10 jornadas × 10 partidos = 100 registros mínimos para calibrar.

---

## 2. MODELO POISSON MEJORADO

### Actual
- Poisson básico con decay exponencial
- Rho fijo (-0.10)
- No distingue home/away strengths por equipo

### Mejoras
- **Grid search de rho** con los históricos (implementado, falta data)
- **Decay óptimo** por liga: ¿0.03 o 0.07? Backtest lo dirá
- **Factores contextuales** en lambda:
  - Motivación (descenso/título/playoff) → multiplicador 0.9-1.15
  - Congestión (2+ partidos en 7 días) → reducción 5-10%
  - Lesiones clave → reducción ataque si falta goleador
  - Mbappé out → lambda_away de Madrid baja ~15%
- **Over/under model**: λ_home + λ_away predice total de goles (útil para empates)
- **Impacto**: +3-5% accuracy en matches de medio rango

---

## 3. SISTEMA ADVERSARIAL COMPLETO (en este repo)

### Actual
- Un solo pipeline: Poisson + surprise detector → P(1X2) directo

### Objetivo (replicar el stack del CIO)
```
Por cada partido:
  3 agentes "tesis pro-X" (paralelos, aislados)
  3 agentes "destrucción adversarial" (paralelos)
  1 agente "juez" (secuencial, ve todo)
```

### Implementación
- `.claude/agents/tesis-pro-1.md` — construye el mejor caso para victoria local
- `.claude/agents/tesis-pro-X.md` — construye el mejor caso para empate
- `.claude/agents/tesis-pro-2.md` — construye el mejor caso para victoria visitante
- `.claude/agents/destruccion-1.md` — desmonta la tesis pro-1
- `.claude/agents/destruccion-X.md` — desmonta la tesis pro-X
- `.claude/agents/destruccion-2.md` — desmonta la tesis pro-2
- `.claude/agents/juez.md` — sintetiza con structured output
- Cada agente recibe el scout report como contexto
- Output: P(1X2) + confianza + riesgo_sorpresa + tesis propia

### Coste
- 7 agentes × 14 partidos = 98 invocaciones por jornada
- Cada uno usa WebSearch para datos frescos
- Estimado: 15-30 min de ejecución paralela

---

## 4. ODDS DE MERCADO (benchmark obligatorio)

### Problema
Sin odds de mercado no podemos:
- Medir si nuestras probs divergen del mercado (edge)
- Activar el Tribunal Supremo (divergencia ≥8pp)
- Calcular ROI esperado

### Solución
- Scraper de odds de una fuente pública (Oddschecker, OddsPortal)
- O input manual pre-jornada (15 partidos × 3 odds = 45 números)
- Almacenar en `state/data/odds/j{N}_odds.json`

### Formato
```json
{"jornada": 35, "odds": [
  {"match": "Barcelona vs Real Madrid", "1": 1.65, "X": 3.80, "2": 5.00,
   "implied_p1": 0.606, "implied_px": 0.263, "implied_p2": 0.200, "margin": 0.069}
]}
```

---

## 5. TRIBUNAL SUPREMO (contra-validación)

### Implementación
- `.claude/agents/tribunal-supremo.md`
- Se activa SOLO cuando |judge_prob - market_prob| > 8pp en algún outcome
- Recibe: tesis del juez, odds de mercado, scout reports de ambos equipos
- Output: JUEZ_CORRECTO / MERCADO_CORRECTO / INCONCLUSO + razonamiento
- El anti_bias.py ya valida que el CIO respete este veredicto

---

## 6. VERIFICADOR 24H (pre-kickoff)

### Actual
- `verificar <team>` en laliga_stats.py (básico)

### Mejora
- Agente dedicado que 24h antes de cada partido:
  1. Busca convocatoria oficial
  2. Busca lesiones/sanciones de última hora
  3. Compara con el scout report usado por los agentes de tesis
  4. Flag si hay discrepancia material
- Output: "SCOUT VÁLIDO" / "SCOUT OBSOLETO — [razón]"
- Si obsoleto: re-run del juez con datos actualizados

---

## 7. CALIBRACIÓN CONTINUA

### Actual
- `analytics/calibration.py` + `analytics/backtest.py` (implementados)

### Mejora
- Ejecutar automáticamente después de cada jornada
- Dashboard de Brier por tipo de partido:
  - Por liga (Primera vs Segunda)
  - Por tipo (favorito en casa / equilibrado / underdog visitante)
  - Por zona (descenso / playoff / mid-table)
- Detectar si un tipo específico de partido está mal calibrado
- Feedback loop: si "empates en zona de descenso" están mal → ajustar el modelo

---

## 8. OPTIMIZADOR DE COLUMNAS

### Actual
- Heurística simple: FIJO si conf > 55%, DOBLE si > 45%, TRIPLE el resto

### Mejora
- **Montecarlo**: simular 10K quinielas con nuestras P(1X2), calcular:
  - P(14 aciertos) = P(especial)
  - P(13) = P(1ª categoría)
  - E[premio] dado N columnas
  - ROI esperado = E[premio] / coste - 1
- **Optimización de presupuesto**: dado un presupuesto (ej: 200€), ¿cuál es la distribución óptima de fijos/dobles/triples?
- **Correlación entre partidos**: si Barça pierde, ¿aumenta prob de que otros grandes también fallen? (factor psicológico liga)

---

## 9. MULTI-LIGA (escalabilidad)

### Actual
- LaLiga + Segunda División

### Mejora
- **Quiniela incluye 15 partidos**: típicamente 10 Primera + 5 Segunda
- Pero a veces incluye partidos de otros horarios o competiciones
- Necesitamos: saber EXACTAMENTE qué 15 partidos van en cada jornada de quiniela
- Fuente: loteriasyapuestas.es publica el programa oficial cada semana
- Scraper del programa oficial → fixtures exactos de la quiniela

---

## 10. ALMACENAMIENTO Y TRAZABILIDAD

### Mejora
- Cada jornada genera un directorio completo:
```
state/data/jornadas/j35/
  ├── fixtures.json          # 15 partidos oficiales de la quiniela
  ├── odds_market.json       # Odds de mercado
  ├── scouts/                # 30 scout reports (2 por partido)
  ├── tesis/                 # 3 tesis por partido (42 total)
  ├── destruccion/           # 3 DA por partido (42 total)
  ├── jueces/                # 14 veredictos del juez
  ├── tribunal/              # Solo para divergencias ≥8pp
  ├── verificador/           # Checks 24h
  ├── cio_decision.json      # Decisión final del CIO
  ├── quiniela_columnas.json # Columnas finales
  ├── resultados.json        # Resultados reales (post-jornada)
  ├── calibration.json       # Brier y análisis (post-jornada)
  └── anti_bias_log.json     # Validación de sesgo
```
- Trazabilidad completa: para cada predicción podemos trazar WHY

---

## PRIORIDADES DE IMPLEMENTACIÓN

| # | Item | Impacto en Brier | Esfuerzo | Bloqueador |
|---|------|-----------------|----------|-----------|
| 1 | Históricos de goles (100+ partidos) | -0.04 | M | Necesita IP no bloqueada o input manual |
| 2 | Programa oficial quiniela (15 partidos exactos) | N/A (corrección) | S | WebSearch de loteriasyapuestas.es |
| 3 | Odds de mercado por jornada | N/A (benchmark) | S | Scraper o input manual |
| 4 | Grid search rho + decay | -0.02 | S | Depende de #1 |
| 5 | Agentes adversariales (7 por partido) | -0.03 a -0.05 | L | Depende de scouts |
| 6 | Montecarlo optimizador de columnas | +ROI | M | Depende de #3 |
| 7 | Verificador 24h automatizado | -0.01 | M | WebSearch funciona |
| 8 | Tribunal Supremo | Evita errores | M | Depende de #3 |
| 9 | Calibración por tipo de partido | Detecta sesgos | S | Depende de backtest |
| 10 | Trazabilidad por jornada | Meta-mejora | M | Infraestructura |

---

## ESTIMACIÓN DE IMPACTO TOTAL

| Estado | Brier | Accuracy | ROI (270 cols) |
|--------|-------|----------|----------------|
| Actual (pipeline básico) | ~0.52 | ~71% | Negativo |
| + Históricos + rho calibrado | ~0.48 | ~74% | Marginal |
| + Adversarial + odds benchmark | ~0.44 | ~77% | Break-even |
| + Montecarlo + optimizador | ~0.44 | ~77% | +10-30% |
| + Verificador + Tribunal | ~0.42 | ~79% | +50-100% |
| Objetivo "BUENO" | <0.40 | >80% | +150%+ |

El salto más grande está en los datos (históricos + odds). Sin ellos, el modelo está ciego. Con ellos, todo lo demás se desbloquea.
