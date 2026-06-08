# 04 · Strategy Map — Hacia dónde va Vetlla y qué revelan sus actos

> Lee `01`–`03` antes. La estrategia no es sólo lo que se dice: es lo que el **esfuerzo, el roadmap y el
> diseño** revelan. Separamos **estrategia declarada** (lo que dice el spec) de **estrategia implícita** (lo
> que muestran los actos en `project_state.yaml`). Refleja junio 2026.

---

## 1. Dónde está y hacia dónde parece ir (3 temas estratégicos)

1. **Ser el "cloud-native de verdad" del sector** — la apuesta técnica frente a un líder de escritorio.
2. **Diferenciarse por IA agéntica útil** — el copiloto administrativo sin competidor directo.
3. **UX para auxiliares + offline** como ventaja operativa a pie de cama.

## 2. Dónde juega hoy

- **Segmento:** residencias, centros de día, viviendas tuteladas. `[Confirmado, spec]`
- **Beachhead implícito (no declarado explícitamente):** por la evidencia (`01` §3, `02` §8), el target
  natural son **centros pequeños/medianos independientes y residencias nuevas** — la cola del ~78% de camas
  fuera del top-15, con menos lock-in y más dolor de escritorio/papel. **Conviene hacerlo explícito.**
- **Geografía:** España (es-ES + ca-ES ya en el MVP). Datos en UE por obligación legal.

## 3. Lo que dicen los actos (estrategia implícita) — y el desajuste clave

El `project_state.yaml` revela algo que **contradice el orden de prioridades declarado**:

- **Declarado** (CLAUDE.md): *"el diferencial es el copiloto de IA agéntica"*; *"no buscamos completitud
  funcional… sino IA útil"*.
- **Hecho:** **H0–H4 y H6 completos** (multitenancy, expediente, atención offline, medicación/MAR, PIA,
  portal de familias, AuditLog), pero **H5 (IA Copilot) DIFERIDO** por decisión explícita (2026-06-07): *"no
  se usará API key de Anthropic por ahora; pendiente decidir modelo (UE/coste/capacidad)"*.

→ **Palabras vs. actos:** el diferencial estrella **aún no existe** en el producto. A día de hoy Vetlla
compite **sólo por arquitectura + UX + offline**, terreno donde los SaaS existentes (GdR, GERIGES, Resilife)
ya están y que es **más fácil de igualar** que la IA. Esto no es necesariamente un error —construir primero el
bucle de uso diario y el system-of-record es una secuencia razonable (sin datos, no hay copiloto útil)— pero
**sí es una tensión estratégica que hay que nombrar y gestionar**, no dejar implícita.

## 4. Words vs. actions — dónde alinean y dónde no

| Declarado | Acto | ¿Alinea? |
|---|---|---|
| Cloud-native, API-first | H0–H6 construidos así (tRPC, multitenant, RLS) | ✅ Sí |
| RGPD-first / datos UE | AuditLog + RLS + principio de datos en UE | ✅ Sí |
| UX para auxiliares / offline | H3 (atención offline) + backlog UX ejecutado | ✅ Sí |
| **IA como diferencial** | **H5 diferido** | ❌ **No (todavía)** |

## 5. Agenda 3–5 años (hipótesis a debatir con el fundador)

- **Año 1:** validar pricing y dolor con 3–5 centros piloto; cerrar el bucle de adopción de auxiliares;
  **migración asistida** y **reporting autonómico** para neutralizar el lock-in del incumbente (`05`).
- **Año 1–2:** activar el copiloto de IA (reactivar H5 cuando se decida modelo UE/coste) — *el diferencial
  prometido*.
- **Año 2–3:** convertirse en **system of record** del residente (foso de coste de cambio propio) y abrir
  expansión por módulos (NRR >100%). Posible "cumplimiento como producto" (UNE 158101, conciertos).
- **Señales a vigilar:** decisión de modelo de IA; primeros precios reales; tasa de adopción; movimientos de
  ADD en IA (Verif-AI).

## 6. Qué puede hacer fracasar la estrategia

- **Regulación:** AI Act alto riesgo en salud encarece/retrasa el copiloto; cambios en conciertos.
- **Economía:** pricing real bajo techo del cliente; CAC/ciclo largos queman caja antes de tracción (`03`).
- **Ejecución:** que la IA siga diferida y el diferencial nunca se materialice; que la adopción del auxiliar
  falle (comprador ≠ usuario).
- **Competencia:** que el incumbente (ADD/ResiPlus) cierre el hueco cloud o de IA antes de que Vetlla escale.
- **Cultura/confianza:** sector conservador; sin referencias y sello de confianza, la venta no arranca.

## 7. Tres escenarios

- **Base:** Vetlla gana centros pequeños/nuevos por cloud+UX; activa IA en 12–18 meses; retención de vertical;
  crecimiento lento pero sólido. *Qué tiene que ser verdad:* pricing ≥ hipótesis y adopción del auxiliar.
- **Upside:** el copiloto de IA resulta un ahorro de tiempo evidente y **sin competidor** → se vuelve la razón
  de compra y permite pricing premium + expansión por módulos; "cumplimiento como producto" abre conciertos.
  *Qué tiene que ser verdad:* IA de verdad útil + datos en UE resuelto.
- **Downside:** ciclo de venta y CAC más largos de lo previsto; IA sigue diferida; incumbente reacciona;
  caja se agota antes de tracción. *Qué lo rompe:* no validar pricing/adopción en el Año 1.

## 8. Si fueras dueño del negocio, los 3–5 movimientos en los que centrarte

1. **Validar pricing y dolor con 3–5 centros** ya (es la incógnita que more mueve `03`).
2. **Decidir el modelo de IA UE/coste y reactivar H5** — o **reposicionar el discurso** mientras tanto
   (vender cloud+cumplimiento como razón de compra y la IA como roadmap), para que palabras y actos cuadren.
3. **Neutralizar el lock-in** del incumbente: migración asistida (con IA de extracción) + reporting
   autonómico nativo + onboarding "en minutos".
4. **Definir el beachhead explícito** (qué tipo de centro primero) y enfocar todo a él.
5. **Construir confianza**: RGPD/UE demostrable, referencias, sello UNE como producto.

---

## Cierre

- **Rumbo:** cloud-native + IA + UX para un sector fragmentado con dolor real de personal y cumplimiento.
- **Mayor tensión:** el diferencial declarado (IA) está diferido → a corto se compite en terreno igualable.
  Decisión pendiente: reactivar IA o reposicionar el relato.
- **Lo que tiene que ser verdad para ganar:** pricing sostenible + adopción del auxiliar + neutralizar el
  lock-in + materializar la IA antes de que el incumbente la copie.
- **Fecha que refleja:** junio 2026.

**Fuentes:** `CLAUDE.md`, `project_state.yaml`, e informes `01`–`03` de este directorio.
