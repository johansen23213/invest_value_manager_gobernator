# 01 · Sector Map — La dependencia y las residencias en España

> *Quién gana dinero, quién tiene el poder, y por qué.* Refleja la realidad a **junio 2026** (cifras de
> cierre 2024 publicadas en 2025; algunas series CSIC son de 2022). Etiquetas: `[Confirmado] [Estimado] [No confirmado]`.

---

## 1. Para qué existe el sector y quién paga

El sector resuelve el **alojamiento y cuidado de personas mayores en situación de dependencia** que no
pueden ser atendidas en su domicilio. Se paga por tres vías:

- **Plaza privada:** la paga el residente/familia. Precio medio **2.118 €/mes en 2025** (+3,77% vs 2024);
  rango 1.800–2.300 €. Euskadi la más cara (2.548 €), Extremadura la más barata (~1.680 €). **El 67% de
  quienes buscan plaza no puede pagar más de 2.000 €/mes.** `[Confirmado, 2025]` — Alimarket, Dependencia.info.
- **Plaza concertada:** gestiona un operador privado, financia parcialmente la Administración vía Sistema
  de Dependencia (Ley 39/2006, SAAD) + copago del usuario (≈60–90% de su pensión según renta y CCAA).
  Precio/día que paga la Administración: Andalucía **63,66 €/día** (2025), Cataluña ~67,42 €, Madrid ~72 €.
  `[Confirmado/Estimado, 2025]` — BOJA 152/2025, Inforesidencias.
- **Plaza pública:** titularidad y financiación públicas.

**Inversión estatal en dependencia 2024: 3.411 M€** (triplica 2014). Financiación SAAD ~50/50 entre
Administración General del Estado y CCAA, más copago. `[Confirmado, 2024]` — IMSERSO/Moncloa.

## 2. Tamaño y estructura

- **~6.002 centros residenciales y 412.109 plazas** (IMSERSO, censo 31-dic-2024; 97,46% centros
  residenciales ≈401.600 plazas, 2,54% viviendas para mayores ≈10.500). `[Confirmado, 2024]`
  Otras fuentes: DBK ~5.600 residencias/~397.000 plazas (2024); censo oficial de 2022, 5.188/381.514.
  *La divergencia viene de que no hay registro único; las competencias están transferidas a las CCAA.*
- **Centros de día: 3.654 centros / 107.689 plazas.** `[Confirmado, 2024]` — IMSERSO.
- **Tamaño económico: facturación 5.650 M€ en 2024** (+6,6%, tercer año creciendo ~7%). `[Confirmado]` — DBK.
- **Titularidad de plazas: ~75% privadas, ~25% públicas.** Dentro de las privadas, ~59% privadas puras y
  ~41% concertadas. `[Confirmado, 2024]` — DBK.

## 3. Quién tiene el poder (cadena de valor)

- **La Administración autonómica** tiene mucho poder: financia conciertos, fija precios/día, acredita
  centros e inspecciona. Marca las reglas del juego.
- **Las familias** pagan la plaza privada y eligen centro; su poder crece con la transparencia (apps de
  familias).
- **Los operadores** (residencias) son nuestros clientes directos. Mercado **muy fragmentado**: los 5
  primeros grupos suman 24% del valor, los 10 primeros 35%; los 15 mayores operadores gestionan ~22% de las
  camas. Los 7 grandes (DomusVi líder con >25.000 camas, Vitalia, Emeis/ex-Orpea, Amavir, Ballesol,
  Colisée, Sanitas) suman >66.000 camas. `[Confirmado, 2024-25]` — DBK, PlantaDoce.
  → **~78% de las camas están fuera del top-15:** una larguísima cola de operadores pequeños e
  independientes, muchos sin software cloud-native moderno. **Este es el campo de juego natural de Vetlla.**
- **Los proveedores de software** (ResiPlus y resto) tienen poder vía coste de cambio (ver `02` y
  `05`); la administración refuerza ese lock-in al exigir reporting integrado.

## 4. La economía de operar una residencia (importa para nuestro pricing)

- Una residencia es un negocio **intensivo en personal y de margen ajustado**: el coste laboral domina y
  está bajo presión (ratios crecientes + escasez, ver §6). Eso significa que **el software compite por un
  presupuesto pequeño** y debe justificarse por **ahorro de tiempo de personal y por cumplimiento**, no
  como gasto tecnológico discrecional.
- El precio de plaza está semi-regulado (concertada) o topado por capacidad de pago (privada, techo de
  ~2.000 €/mes para 2 de cada 3 familias). El operador **no puede subir precio libremente** → cuida costes.

## 5. Qué empuja el crecimiento

- **Demografía estructural:** población ≥65 pasa de 20,4% a ~30,5% hacia 2055; **≥80 (el segmento más
  dependiente) de 6,3% en 2025 a ~11% en 2050**; +1,4 M de >65 entre 2025 y 2030. `[Confirmado]` — INE, Funcas.
- **Déficit de plazas:** cobertura ~4,2 plazas/100 >65 frente a las 5 que recomienda la OMS; déficit
  ~75.000 plazas hoy, proyección hasta **172.000 camas en 2030** (JLL). → se construirán residencias nuevas
  (clientes nuevos, sin software heredado: oportunidad de entrada).
- **Digitalización y cumplimiento** (ver §6): la regulación obliga a registrar y trazar más.

## 6. Qué tapona el crecimiento (y crea demanda de software)

- **Presupuesto público** limitado y desigual por CCAA (cobertura pública estancada ~2,63 plazas/100).
- **Escasez crónica de personal:** ~320.000 trabajadores en residencias (2024, +40% desde 2014, 86%
  mujeres); déficit de enfermería (media **109 residentes por enfermera**; salario de convenio ~1.500 €
  frente a ~2.000 € en Atención Primaria → fuga). `[Confirmado, 2024-26]` — Funcas, Infosalus.
- **Ratios de acreditación al alza:** el Acuerdo del Consejo Territorial (BOE, 28-jul-2022) sube la ratio de
  atención directa de **0,31 (fin 2023) a 0,43 (2029)** y exige 65% de habitaciones individuales y modelo de
  unidades de convivencia. `[Confirmado, 2022]`
- **Carga documental e inspección:** PIA con firmas, registro de medicación (MAR), protocolos e indicadores;
  inspecciones autonómicas a menudo sin previo aviso. Problema recurrente: **registros en papel con firmas
  faltantes o datos incompletos.** `[Confirmado]` — fuentes sectoriales.
- **Calidad obligatoria de facto:** norma **UNE 158101**; Madrid (Orden 2680/2024) exige certificación a
  **todas** las residencias **antes de noviembre de 2026**, como condición de conciertos. `[Confirmado, 2024]`
- **Marco de datos exigente:** datos de salud = categoría especial (art. 9 RGPD); el **AI Act (UE 2024/1689)**
  clasifica muchas aplicaciones sanitarias como alto riesgo; la AEPD ya publicó guía de **IA agéntica**.
  `[Confirmado, 2024-25]`

## 7. Riesgos a nivel de sector

- **Dependencia del presupuesto público** y de decisiones políticas (precios/día, ritmo de conciertos).
- **Sector conservador y regulado:** ciclos de adopción lentos, aversión al riesgo, la confianza pesa tanto
  como la tecnología.
- **Consolidación** por fondos (grupos franceses): si el mercado se concentrara, el poder de compra de
  software se desplazaría hacia pocos grandes con capacidad de negociar o desarrollar a medida.

---

## Cierre

- **Motor económico del sector:** cuidado intensivo en personal, financiado por familias + Administración,
  con margen ajustado y demanda estructural creciente por envejecimiento.
- **Quién captura el valor:** operadores (fragmentados) y, en software, el incumbente vía lock-in regulatorio.
- **Principal driver de crecimiento:** demografía (octogenarios) + déficit de plazas.
- **Mayor constraint:** personal y presupuesto → presión por eficiencia y cumplimiento. *Es justo el dolor
  que un software de gestión puede aliviar.*
- **Riesgo clave:** sector lento, regulado y dependiente de lo público.
- **Tipo de empresa que tiende a ganar en software:** la que reduce fricción de personal y garantiza
  cumplimiento/trazabilidad con bajo coste de cambio de entrada.
- **Fecha que refleja:** junio 2026.

**Fuentes:** IMSERSO (censo dic-2024), INE (proyecciones 2024-2074), DBK/Informa (2024-2025), CSIC
Envejecimiento en Red, JLL, Funcas, BOJA 152/2025, BOE-A-2022-13580, AEPD, Alimarket, Dependencia.info,
PlantaDoce, Inforesidencias. Detalle en los paquetes de investigación de junio 2026.
