# JORNADA 35 — BRIEF DEL GOBERNATOR
**Fecha: 2026-05-04 (pre-jornada)**

---

## PARTIDOS CLAVE (por impacto en clasificación)

### P8: Barcelona vs Real Madrid (Dom 10/05, 21:00) ⭐ EL CLÁSICO
- **Situación**: Barça 88 pts (1º) vs Madrid 77 pts (2º). Gap: 11 pts.
- **Si gana Barça**: Campeón matemático (91 pts, inalcanzable a 3 jornadas).
- **Si gana Madrid**: Se acerca a 80 pts, mantiene esperanza teórica (necesitaría 9/9 y que Barça saque 0/9).
- **Estimación**: P(1)=50% P(X)=25% P(2)=25%
- **Nota para quiniela**: El mercado probablemente sobrevalora el empate en Clásicos. Barça en casa esta temporada es demoledor.

### P2: Sevilla vs Espanyol (Sáb 09/05)
- **Situación**: Sevilla 18º (34 pts) vs Espanyol 13º (39 pts).
- **Sevilla DEBE ganar** para salir del descenso. Presión máxima en casa.
- **Riesgo sorpresa**: Bajo. Sevilla tiene más urgencia. Pero ojo — 34 pts en J35 indica un equipo que no sabe ganar.
- **Estimación**: P(1)=50% P(X)=28% P(2)=22%

### P1: Elche vs Alavés (Sáb 09/05)
- **Situación**: Elche 14º (38 pts) vs Alavés 17º (36 pts).
- **Directo por salvación.** Máxima tensión, mínima calidad.
- **Perfil de empate alto**: Equipos que no quieren perder más que querer ganar.
- **Estimación**: P(1)=40% P(X)=32% P(2)=28%

### P10: Rayo Vallecano vs Girona (Dom 11/05)
- **Situación**: Rayo 11º (42 pts, seguro) vs Girona 16º (38 pts, en peligro).
- **Girona necesita puntos** pero viene de perder 0-1 vs Mallorca en casa.
- **Rayo en Vallecas es fuerte**: Han ganado 0-2 en Getafe esta jornada.
- **Estimación**: P(1)=45% P(X)=28% P(2)=27%

---

## PARTIDOS CON RESULTADO CLARO (baja incertidumbre)

### P3: Atlético Madrid vs Celta (Sáb 09/05)
- Atlético 4º (63 pts) en casa. Celta 6º (47 pts).
- Atlético ha ganado 0-2 en Valencia esta jornada. Sólido.
- **Estimación**: P(1)=55% P(X)=25% P(2)=20%

### P5: Mallorca vs Villarreal (Dom 10/05)
- Villarreal 3º (68 pts) viene de meter 5-1 al Levante.
- Mallorca 15º (38 pts) necesita puntos.
- **Estimación**: P(1)=30% P(X)=28% P(2)=42% — Villarreal favorito incluso fuera.

---

## ANÁLISIS PARA EL PIPELINE

### Partidos donde el juez debería divergir del mercado:
1. **P8 Barcelona-Madrid**: Si el mercado da >30% al empate, el juez debería bajar. Barça en casa con opción de ser campeón = motivación máxima.
2. **P5 Mallorca-Villarreal**: Si el mercado da >45% al local, el juez debería ajustar. Villarreal está en forma bestial (5-1 al Levante).
3. **P1 Elche-Alavés**: Si el mercado subestima el empate, aquí hay edge. Partidos de salvación = empate.

### Partidos con riesgo de sorpresa (donde buscar edge):
1. **P7 Oviedo-Getafe**: Oviedo 20º desesperado. ¿Puede Getafe relajado perder?
2. **P9 Levante-Osasuna**: Levante 19º tras paliza 1-5. ¿Reacción o hundimiento?
3. **P6 Athletic-Valencia**: Valencia acumula derrotas (0-2 vs Atlético). ¿Otra más?

### Riesgo de sorpresa visitante (lo que destruyó J60):
- **P10 Rayo-Girona**: Girona con la soga al cuello podría ganar fuera.
- **P4 Real Sociedad-Betis**: Betis es el mejor visitante del top-6.
- **P7 Oviedo-Getafe**: Getafe es especialista en ganar sucio fuera.

---

## MÉTRICAS FALTANTES (para scouts)

Para convertir esto en scouts completos necesitamos:
- [ ] Lesiones actualizadas de cada equipo
- [ ] Convocatorias oficiales (24-48h antes)
- [ ] xG acumulado por equipo (FotMob bloqueado, buscar alternativa)
- [ ] Head-to-head temporada actual (ida)
- [ ] Datos de pressing y posesión por equipo

**Limitación actual**: FotMob devuelve 403 desde este entorno. Los datos se obtienen via WebSearch, que da overview pero no detalle granular. Para el pipeline completo necesitamos acceso desde un entorno con IP no bloqueada.
