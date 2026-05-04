# Pipeline Improvement Plan
## 2026-05-04

## Diagnóstico (5 fallos identificados)

1. **Data poverty**: FotMob 403. Poisson sin xG, sin lesiones, sin pressing
2. **Brier 0.634**: Apenas mejor que random. Rho fijo, sin recency, sin split home/away
3. **Regression to safety**: Pipeline adversarial favorece consenso, infraprecio de upsets
4. **Sorpresas visitantes**: J60 falló en 2. No hay detección de upset patterns
5. **Sin feedback loop**: No se comparan predicciones vs resultados post-hoc

## Estructura propuesta

```
analytics/
  calibration.py          Brier score, curvas calibración, detección de sesgos
  enhanced_poisson.py     Poisson mejorado: recency, xG, rho fitted, home/away split
  surprise_detector.py    Predictor de sorpresas visitantes (6 factores)
  market_comparison.py    Edge vs mercado, Kelly criterion

scrapers/
  fbref_scraper.py        xG, posesión, pressing via WebSearch
  injury_tracker.py       Lesiones/sanciones via WebSearch Transfermarkt
  odds_scraper.py         Odds del mercado via WebSearch

pipeline/
  matchday_runner.py      Orquestador: scouts → tesis → juez → CIO
  backtest.py             Validación histórica
  post_mortem.py          Análisis post-jornada → feedback

.claude/agents/ (nuevos)
  scout-team.md           Investigar equipo para un partido
  thesis-pro.md           Defender un resultado (1, X, o 2)
  thesis-adversarial.md   Destruir una tesis
  thesis-devil.md         SIEMPRE argumenta el upset (sin DA)
  judge-match.md          Sintetiza → P(1X2) con anti-safety-bias
  verifier-24h.md         Check pre-kickoff
  supreme-tribunal.md     Arbitra model vs mercado
  cio-strategy.md         Selección final de columnas
```

## Mejora clave: Abogado del Diablo

El pipeline actual (3 pro + 3 DA + 1 juez) es simétrico → las tesis de upset
pierden la ronda adversarial porque tienen menos evidencia.

Solución: añadir un thesis-devil.md que SIEMPRE argumenta por el upset y
va DIRECTAMENTE al juez sin pasar por DA. Así el juez siempre oye el caso
del upset bien argumentado.

## Surprise Detector (6 factores)

```
surprise_risk = (
  0.25 * home_fragility +       # forma local últimos 6 en casa
  0.20 * away_competence +      # forma visitante últimos 6 fuera
  0.20 * motivational_asymmetry + # relegación/título/nada-en-juego
  0.15 * congestion_penalty +   # 3 partidos en 7 días
  0.10 * key_player_absence +   # goleador/portero lesionado
  0.10 * historical_venue_factor  # historial del estadio
)

Si surprise_risk > 60: juez DEBE asignar ≥20% al visitante
Si surprise_risk > 75: CIO DEBE cubrir upset en al menos 1 columna
```

## Secuencia de implementación

Phase 0: calibration.py (medir antes de mejorar)
Phase 1: enhanced_poisson.py + surprise_detector.py
Phase 2: scrapers (FBref xG, lesiones, odds)
Phase 3: 8 agent prompts
Phase 4: pipeline orchestration
Phase 5: feedback loop continuo

## Segunda División

La quiniela incluye partidos de Segunda. J60 tuvo 2 fallos ahí (P11 Eibar-Málaga, P13 Sporting-Ceuta).
Los scrapers y scouts DEBEN cubrir Segunda también. El surprise_detector aplica igual:
- Málaga (6º, playoff zone) ganó 4-2 fuera → equipo con algo en juego
- Ceuta (recién ascendido, cómodo) ganó 1-2 fuera → sin presión = fútbol libre
