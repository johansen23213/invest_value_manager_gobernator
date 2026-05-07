# Match Analysis Framework — ALL factors

> Every match prediction MUST evaluate these factors before assigning P(1X2).
> Missing data on a factor = flag it, don't ignore it.

---

## 1. FATIGA Y CALENDARIO
- [ ] ¿Equipo jugó en Europa entre semana? (Champions, Europa, Conference)
- [ ] Distancia del viaje europeo
- [ ] ¿Partido de Copa entre semana?
- [ ] Días de descanso entre partidos (3 vs 7)
- [ ] Minutos acumulados del XI titular últimas 2 semanas
- [ ] Jugadores recién vueltos de selección (viajes largos)

## 2. MOTIVACIÓN / OBJETIVO
- [ ] Posición en tabla y qué se juega (descenso, Europa, título)
- [ ] ¿Ya no se juega nada? (final de temporada)
- [ ] ¿Eliminado de Europa recientemente? (moral baja o alivio)
- [ ] ¿Final de Copa próxima? (guardan titulares)
- [ ] ¿Jornada antes de derbi o Champions? (distracción)
- [ ] Diferencia de puntos a la zona objetivo (poca o demasiada)

## 3. PLANTILLA
- [ ] Lesiones declaradas (lista completa)
- [ ] Sanciones por amarillas / roja
- [ ] ¿Top scorer fuera? ¿Portero titular fuera? ¿Pivote fuera?
- [ ] Jugadores en recuperación (entrenan pero no juegan)
- [ ] Convocatoria reducida
- [ ] Amarillas pendientes de ciclo (jugador que no arriesga)

## 4. TÁCTICO / RIVALIDAD
- [ ] ¿Cambio reciente de entrenador? (efecto rebote 2-4 partidos)
- [ ] H2H reciente (últimos 5-10 enfrentamientos)
- [ ] Resultado de la ida esta temporada
- [ ] Sesgo local/visitante extremo del equipo
- [ ] Compatibilidad de estilos (presión alta vs sufren presión)
- [ ] Ausencia del jugador clave histórico contra ese rival

## 5. FORMA
- [ ] Racha últimos 5 (W/D/L) — general, casa, fuera
- [ ] Goles recibidos y clean sheets recientes
- [ ] Sequía goleadora del top scorer
- [ ] Sequía sin victoria (presión por romperla)
- [ ] Último resultado humillante o victoria moral
- [ ] Eliminación reciente en Europa (moral)

## 6. VENUE / EXTERNOS
- [ ] Estadio en obras o jugando fuera de su campo
- [ ] Hora del partido (14h en mayo en Sevilla ≠ 21h en Bilbao)
- [ ] Derbi / clásico (varianza extrema)
- [ ] Visitante con poca/mucha afición desplazada

## 7. ÁRBITRO
- [ ] Estilo (tarjetero, permisivo)
- [ ] Goles promedio en sus partidos
- [ ] Histórico con cada equipo

## 8. JUGADOR CONCRETO / SCOUT
- [ ] Goleador en racha que el promedio no captura
- [ ] Portero suplente debutando
- [ ] Jugador volviendo de lesión larga
- [ ] Cambios de posición no documentados

## 9. MERCADO
- [ ] Movimiento de cuotas apertura vs cierre (si disponible)
- [ ] Sesgo público vs cuota real

## 10. CLUB / INSTITUCIONAL
- [ ] Cambio reciente de presidente/directiva
- [ ] Crisis económica
- [ ] Venta inminente de jugador clave
- [ ] Crisis de vestuario

## 11. CALENDARIO ESPECÍFICO LALIGA
- [ ] Última jornada de temporada (todo se rompe)
- [ ] Equipos recién ascendidos (volatilidad alta)
- [ ] Partido aplazado o reprogramado
- [ ] Hueco Champions (martes-martes vs sábado-sábado)

---

## Scoring

Para cada factor investigado:
- **Favorece LOCAL**: +1 a +3
- **Neutral**: 0
- **Favorece VISITANTE**: -1 a -3
- **Favorece EMPATE**: marca separada

Sumar todos los factores → ajustar P(1X2) base proporcionalmente.

## Anti-bias rule

Si no has investigado al menos 6 de los 11 bloques para un partido,
NO puedes ponerlo como FIJO. Va como DOBLE o TRIPLE.
