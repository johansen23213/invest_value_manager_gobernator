# ADR 0016 — Ampliación de alcance: core asistencial completo (competir con ResiPlus)

- **Estado:** Aceptada (Angel confirma 2026-06-13: grado **core-suficiente + diferencial**, NO paridad total. Primer módulo: pendiente del gap analysis de Pau, a elección de Angel.)
- **Fecha:** 2026-06-13
- **Hito:** Iteración MVP → producto de mercado (post-INC-1)

## Contexto

`CLAUDE.md` declara hoy un principio de producto explícito: **"No buscamos
completitud funcional (eso lo tiene el líder, ResiPlus), sino ser cloud-native de
verdad, API-first y con IA útil."** En coherencia, la sección de alcance lista
**"Fuera (roadmap)"**: facturación/contabilidad completa, cuadrantes/turnos,
mantenimiento, transporte, integraciones farmacia/administración, copiloto de
cumplimiento normativo.

Angel ha decidido **ampliar el alcance** para incluir el **core asistencial
completo equivalente a ResiPlus**: facturación/contabilidad, RRHH/turnos,
farmacia/almacén, dietética, mantenimiento, transporte e informes regulatorios a
la administración. Esto **contradice un principio declarado**, por lo que se
formaliza aquí.

Contexto adicional: la **SuperApp residente/familia** ya está en marcha y refuerza
el diferencial de experiencia frente a un ERP clásico. El cambio no sustituye el
diferencial; lo suma a una aspiración de paridad funcional.

## Decisión

Se amplía el alcance del producto. **Vetlla aspira a un core asistencial completo**
(facturación, RRHH/turnos, farmacia/almacén, dietética, mantenimiento, transporte,
informes regulatorios) **manteniendo intacto el diferencial**: cloud-native,
API-first (tRPC tipado extremo a extremo), multitenant con **RLS+FORCE**, copiloto
de IA agéntica, UX para auxiliares y SuperApp residente/familia.

El diferencial **no es negociable** y debe preservarse módulo a módulo: cada
módulo nuevo nace cloud-native, tipado, con su tenant + RLS, y con IA donde aporte.
La paridad funcional se persigue **sin renunciar** a ninguno de los cinco
principios de producto.

El **grado** de paridad (paridad total ResiPlus vs core-suficiente, ver
*Alternativa*) queda **pendiente de confirmación de Angel**. Esta decisión fija el
*rumbo* (ampliar) y la *arquitectura* (cómo crecer sin romper invariantes); el
grado afecta a roadmap y plazos, no a la forma de construir.

## Consecuencias y riesgos

### (a) El grueso del esfuerzo de "paridad ResiPlus" es profundidad normativa, no UX

La mayor parte del trabajo para igualar a ResiPlus **no es interfaz**, sino
**profundidad normativa y cumplimiento**, que es lento, cambiante y poco
diferenciador:

- **Facturación/contabilidad:** **Verifactu / SII** (AEAT), formatos y series
  fiscales, IVA/exenciones sociosanitarias, **SEPA** (adeudos, ficheros
  bancarios), conciliación, copago/aportación del usuario, liquidaciones a la
  Administración.
- **Informes regulatorios:** formatos de informe a **SISAAD** y a los sistemas de
  **dependencia de cada CCAA** — cada comunidad autónoma tiene su esquema,
  periodicidad y vías de envío. Esto es **N integraciones**, no una.
- **RRHH/turnos:** convenios, cómputos de jornada, e integración laboral para
  **nóminas** (Seguridad Social, ficheros a gestoría/software laboral).
- **Farmacia/almacén:** trazabilidad, recetas, y eventual interlocución con
  sistemas de farmacia.

Implicación: buena parte del coste es **reglas por jurisdicción** que envejecen y
exigen mantenimiento continuo. **No es donde ganamos**; es deuda de paridad. Debe
dimensionarse y, donde sea posible, **acotarse por CCAA** (priorizar las de los
pilotos) en lugar de prometer cobertura nacional desde el día uno.

### (b) Riesgo de dispersión: cada módulo es prácticamente un producto

Facturación, RRHH/turnos, almacén, transporte… **cada uno es un dominio con su
propio modelo, reglas, integraciones y experto**. Acometerlos en paralelo
diluye foco y calidad y pone en riesgo el diferencial (que es lo que nos hace
ganables). Mitigación: **secuenciar por valor** (lo que un centro toca a diario
primero), un dominio "en serio" cada vez, y no abrir un módulo nuevo sin cerrar el
anterior a nivel de invariantes (tenant+RLS+tests).

### (c) Impacto en multitenancy/RLS: el patrón escala (bien encaminado)

Todos los módulos nuevos **deben** seguir el invariante ya establecido
(`tenantId` + RLS + `FORCE` + política que falla en cerrado, ADR-0002/0014) y el
modelo de rol de app no-propietario. Esto es **buena noticia**: el patrón es
uniforme y **escala** a más tablas sin rediseño. Riesgo asociado: con muchos más
modelos, un olvido es más probable → **se debe priorizar el checklist/lint
pendiente** (ADR-0002 deja explícito que falta) que garantice, en migración, que
toda tabla con datos lleva tenant+RLS+FORCE+política y su test de aislamiento.

### (d) Decisión arquitectónica: monolito modular vs servicios/packages separados

¿Cada módulo como **package separado** o dentro de `apps/web`? ¿Facturación como
**dominio aislado**?

**Recomendación: mantener el monolito modular actual.** Un solo router tRPC
compuesto por **routers por dominio** (`billing`, `hr`, `inventory`, …) y **tablas
por dominio** en el schema Prisma único, con la **lógica de dominio pura extraída
y testable** (sin BD) por módulo. Razones:

- Conserva la **tipización extremo a extremo** y el contexto de tenant/RLS sin
  fronteras de red ni de proceso.
- Es **reversible**: extraer un servicio (p. ej. facturación, si su carga o su
  cadencia de despliegue lo justifican) es más fácil desde fronteras de módulo
  limpias que crear microservicios de entrada (decisión costosa e irreversible).
- **No se extrae un servicio hasta que el tamaño lo justifique** (carga,
  aislamiento de fallos, equipo dedicado, cadencia de release distinta). Documentar
  esa extracción en su propio ADR cuando llegue.

Disciplina exigida ahora para que la extracción futura sea barata: límites de
módulo nítidos, dominio puro sin I/O, y **sin acoplamientos cruzados** entre
routers que no pasen por interfaces explícitas.

### (e) Dependencias externas que requieren decisión/contrato de Angel

La ampliación introduce dependencias que son **decisión de negocio**, no técnica, y
deben resolverse antes de construir el módulo afectado:

- **Pasarela de pagos / cobros** (SEPA y/o tarjeta) — proveedor con presencia/UE y
  capacidad SEPA. (Hoy el cambio de plan es por contacto, ADR-0015; facturar a
  residentes es otro nivel.)
- **Object storage en UE** para documentos/justificantes/informes (residencia de
  datos obligatoria, art. 9 RGPD).
- **Posibles APIs/portales de la Administración** (SISAAD, dependencia por CCAA,
  AEAT/Verifactu-SII, ámbito laboral) — algunas requieren alta, certificados o
  convenios.

Estas dependencias condicionan plazos y coste recurrente; **se escalan a Angel/CIO**
para contratación y priorización.

## Alternativa considerada: "core suficiente + diferencial"

No perseguir **paridad total** con ResiPlus, sino **cubrir lo que un centro
necesita en su día a día** (la operación real: ocupación, expediente, atención,
medicación/MAR, PIA, facturación esencial al residente, turnos básicos, almacén
básico, informes de los CCAA de nuestros clientes) y **ganar por UX + IA +
SuperApp + precio + time-to-value**, dejando la cola larga normativa (todas las
CCAA, toda la contabilidad analítica, nóminas completas) como **roadmap por
demanda** o vía **integración** con software especializado (p. ej. gestoría/laboral
externo) en vez de reimplementarlo.

**Trade-off:**

- *Paridad total* — Pro: elimina la objeción "me falta X" en concursos/grandes
  grupos; sustituye a ResiPlus de raíz. Contra: el esfuerzo dominante es la cola
  normativa poco diferenciadora (a); años de trabajo; alto riesgo de dispersión (b)
  y de **diluir el diferencial** mientras corremos detrás de reglas fiscales/CCAA.
- *Core suficiente + diferencial* — Pro: mantenemos foco en lo que nos hace ganar,
  llegamos antes al mercado, y la profundidad normativa entra **por demanda real de
  clientes** (priorización guiada por pilotos). Contra: en grandes cuentas seguirá
  apareciendo "ResiPlus hace Y y vosotros no"; obliga a una **narrativa comercial**
  clara (ganamos por experiencia + IA + precio, integramos lo especializado).

**Recomendación (Marc):** **core-suficiente + diferencial**, ampliando profundidad
normativa **por CCAA/cliente real**, porque concentra el esfuerzo donde Vetlla
gana (cloud-native + IA + SuperApp) y evita gastar el grueso del presupuesto en la
cola normativa indiferenciada antes de validar demanda. La **elección de grado es
de Angel** (negocio): esta recomendación es de arquitectura/foco, no de estrategia
comercial.

## Enmienda pendiente a `CLAUDE.md` (la aplica el CIO al confirmar con Angel — no editar aquí)

Al confirmarse esta decisión, `CLAUDE.md` debe actualizarse para no contradecir el
nuevo rumbo:

1. **Cabecera "Diferencial":** la frase *"No buscamos completitud funcional (eso lo
   tiene el líder, ResiPlus)…"* debe reescribirse para reflejar que **sí se aspira
   al core asistencial completo, manteniendo el diferencial como ventaja**. Sugerido:
   "Aspiramos al core asistencial completo, pero ganamos por ser cloud-native de
   verdad, API-first, multitenant y con IA útil." (Ajustar al grado que decida Angel.)
2. **Sección de alcance, "Fuera (roadmap)":** mover de "Fuera" a "Dentro
   (roadmap por fases)" los módulos ahora en alcance — facturación/contabilidad,
   cuadrantes/turnos, farmacia/almacén, dietética, mantenimiento, transporte,
   informes regulatorios a la administración — dejando claro su **carácter por
   fases** y, según el grado elegido, su **acotación por CCAA**. Mantener "Fuera"
   solo lo que siga sin estar previsto.
3. **Referenciar este ADR** desde `CLAUDE.md`/`project_state.yaml` como origen del
   cambio de alcance.

> Nota: este ADR **no edita** `CLAUDE.md` ni `docs/producto` (los lleva Pau en
> paralelo). La enmienda queda redactada para que el CIO la aplique tras confirmar
> con Angel.

## Verificación / próximos pasos al aceptar

- Confirmación de Angel del **grado** (paridad total vs core-suficiente) y del
  **orden de módulos** por valor.
- Priorizar el **checklist/lint de invariante RLS** (ADR-0002 pendiente) antes de
  multiplicar modelos.
- Por cada módulo nuevo: ADR propio si la decisión es no trivial; modelo de datos
  con tenant+RLS+FORCE+test de aislamiento; contratos tRPC (Zod in/out); dominio
  puro testable; y los e2e del flujo crítico.
- Resolver con Angel las **dependencias externas** (e) antes de arrancar el módulo
  que las requiere.
