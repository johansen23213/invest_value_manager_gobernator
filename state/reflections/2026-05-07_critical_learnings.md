# Aprendizajes Críticos — 2026-05-07

## ERROR PRINCIPAL DE ESTA SESIÓN

Construí un sistema con 42 comandos, 14 agentes, 8 módulos de analytics,
y al final generé la quiniela con un modelo de 2 variables (posición + 4 flags).
Todo lo demás quedó sin usar. **El sistema no vale nada si no lo uso.**

## LOS 3 PRINCIPIOS QUE NO DEBO OLVIDAR

### 1. El objetivo NO es acertar — es acertar DONDE EL PÚBLICO NO ACIERTA
- La quiniela es un juego contra otros apostantes, no contra la realidad
- Si todo el mundo pone 1 al Barcelona y sale 1, el premio se reparte entre millones
- Si nadie pone X al Rayo-Girona y sale empate, el premio es enorme
- NECESITO los porcentajes del público para calcular el edge real
- Sin esos datos, no puedo saber si tengo hedge o estoy apostando igual que todos
- Fuente: eduardolosilla.es/quiniela/ayudas/estimacion (bloqueado desde aquí)

### 2. Un modelo simple con datos insuficientes es PEOR que investigar cada partido
- El Poisson con 100 partidos dio Brier 0.723 (peor que random)
- El position model con base rates dio Brier 0.475 (mejor)
- Pero NINGUNO sustituye a la investigación partido a partido
- Cada partido tiene contexto único: fatiga, motivación, lesiones, H2H, árbitro...
- El framework de 11 bloques de factores DEBE aplicarse a cada partido
- Si no puedo investigar 6 de 11 bloques → NO puede ser FIJO

### 3. Los empates destruyen quinielas
- 24% de empates en LaLiga = P(al menos 1 empate en 7 dobles sin X) = 85%
- Partidos de salvación directa (Elche-Alavés) empatan MÁS que la media
- Partidos con equipo que empata todo (R.Sociedad DDDLW) son trampas
- Clásicos y derbis tienen varianza extrema → empate siempre viable
- REGLA: si P(X) > 25% en un partido, DEBE ir como triple o doble 1/X

## DATOS VERIFICADOS QUE NO DEBO PERDER

### Barça-Madrid (P15)
- Barcelona ha ganado 3/3 esta temporada: 0-4 Liga, 2-5 Supercopa, 3-2 Copa
- Barcelona 9 partidos sin perder en casa (8W 1D)
- Mbappé lesionado (semitendinoso izq, 27 abril). Test 6 mayo. 50/50.
- Madrid SIN: Courtois, Carvajal, Militao, Arda Güler, Rodrygo (temporada)
- Barcelona campeón si gana (91pts inalcanzable)

### Atlético-Celta (P3)
- Atlético ELIMINADO de Champions por Arsenal 1-0 (5 mayo)
- Pablo Barrios y Nico González lesionados
- Celta lucha por Europa League (6º, 47pts)

### Sevilla (P2)
- Ganó 1-0 a Real Sociedad (4 mayo) → salió del descenso
- Forma: LWLLL (1 victoria en 5)
- Isaac Romero dudoso

### Suspensiones J35
- Aleñá (Alavés), Bryan Gil (Girona), Arriaga (Levante)
- Maffeo (Mallorca), Aramburu (R.Sociedad)

### Villarreal (P5)
- 3º con 68pts. Champions asegurada. PUEDE rotar.
- Forma fuera: LWWWW (4 victorias seguidas)
- Arnau Tenas titular en vez del habitual

### Bote actualizado
- 2.200.000€ (no 1.9M como tenía antes)

## FACTORES QUE DEBO INVESTIGAR Y NO PUEDO DESDE AQUÍ

1. Porcentajes de apuestas del público (eduardolosilla.es)
2. Odds de casas de apuestas (para calcular probabilities implícitas)
3. Convocatorias oficiales (se publican el viernes mañana)
4. Árbitros asignados a cada partido
5. Estado del campo/estadio
6. Datos de Segunda División (forma, lesiones, contexto playoff)

## ESTRUCTURA DEL SISTEMA (para la próxima sesión)

```
Para cada partido:
1. Investigar 11 bloques de factores → ajustar P(1X2)
2. Obtener % del público → calcular HEDGE
3. Si mi prob difiere >8pp del público → ese es el edge
4. Si mi prob es IGUAL al público → no hay edge, reducir apuesta
5. Solo poner FIJO donde: mi prob > 52% Y el público < 70%
6. Poner TRIPLE donde: alta incertidumbre O público masivamente mal
```
