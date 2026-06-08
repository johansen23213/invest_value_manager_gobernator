# 00 · Metodología — Análisis del modelo de negocio de Vetlla

- **Fecha:** 2026-06-08 · **Autor:** equipo Vetlla
- **Qué es esto:** una serie de 5 informes para entender el negocio de Vetlla **desde cero**, adaptando un
  framework de análisis de empresas cotizadas (pensado para inversores que leen cuentas oficiales) al caso
  de una **startup pre-ingresos** que su fundador está construyendo.

---

## El giro respecto al framework original

El framework de partida (Industry Map → Business Model → Economics Engine → Strategy Map + chequeo de
contradicciones) está diseñado para **juzgar una acción** de una empresa que ya cotiza, tomando sus
**filings auditados** (10-K/20-F, earnings calls) como fuente de verdad. Vetlla no es eso. Por tanto:

| | Framework original | Aquí (Vetlla) |
|---|---|---|
| Quién mira | Inversor externo | **Fundador/operador** que diseña el negocio |
| Qué mira | Empresa que ya cotiza | **Startup pre-ingresos**, en construcción |
| Fuente de verdad | Filings auditados | **Evidencia de sector + competidores + economía del cliente + regulación.** El spec (`CLAUDE.md`) es **hipótesis**, no hecho |
| Resultado | ¿Compro la acción? | ¿Es viable el modelo? ¿Qué tiene que ser verdad? ¿Dónde está el riesgo? |

Matiz propio de este caso: **el cliente (la residencia) es a su vez un negocio.** Su economía (presupuesto,
plazas concertadas vs privadas, márgenes, personal) determina nuestro poder de fijar precio. Por eso el
informe de economía tiene **dos capas**: la del centro y la de Vetlla.

## Reglas de disciplina (heredadas del framework)

1. **Fuente para cada dato.** Cada cifra lleva su origen. Lo no sustentado se etiqueta.
2. **Etiquetas de confianza:** `[Confirmado]` (fuente directa), `[Estimado]` (derivado/aproximado/regla de
   mercado), `[Hipótesis]` (apuesta de Vetlla sin verificar), `[No confirmado]` (no se pudo verificar).
3. **No inventar números.** En una startup casi todo es hipótesis; etiquetar es más importante, no menos.
4. **Separar hecho de interpretación.** Los datos van con su etiqueta; la lectura estratégica va señalada
   como "Lectura".
5. **Marcar la caducidad.** Cada informe dice a qué fecha refleja la realidad.

## Los informes

- `01-sector-map.md` — Quién gana dinero y quién tiene el poder en la dependencia en España.
- `02-business-model.md` — Qué vende Vetlla, a quién y por qué comprarían.
- `03-economics-engine.md` — Economía del cliente + unit economics de Vetlla.
- `04-strategy-map.md` — Rumbo, palabras vs. actos, escenarios.
- `05-contradiction-check.md` — Dónde se contradicen los informes y qué fuente creer.

## Origen de la evidencia (junio 2026)

Investigación web propia (4 líneas: estructura del sector, financiación/regulación/personal,
competidores/pricing, benchmarks SaaS) + el estudio previo `docs/mercado/2026-06-07-estudio-competencia.md`.
Fuentes primarias destacadas: IMSERSO (censo dic 2024), INE (proyecciones 2024-2074), DBK/Informa,
CSIC Envejecimiento en Red, JLL, BOE (Acuerdo de acreditación 2022), AEPD, y webs oficiales de los
competidores. Benchmarks SaaS: KeyBanc 2024, Bessemer, ICONIQ 2026, ChartMogul, a16z; precios de IA de la
documentación oficial de Anthropic.

**Limitación conocida:** no existe registro único oficial de residencias en España; las cifras divergen
entre IMSERSO, DBK y CSIC por metodología y fecha. Varios sitios (BOE, IMSERSO, DBK, Inforesidencias,
Alimarket) bloquean el acceso automatizado; sus datos se cruzaron con prensa y agregadores.
