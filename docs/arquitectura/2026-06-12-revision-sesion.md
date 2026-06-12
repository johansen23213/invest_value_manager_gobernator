# Revisión de sesión — calidad de código y coherencia arquitectónica

> **Fecha:** 2026-06-12 · **Autor:** Marc (Tech Lead) · **Tipo:** revisión solo-lectura (no se tocó código).
> **Alcance:** auth (reset/invitación), expediente Fase 1 (`clinical.ts`, 9 tablas) y los tres módulos
> gemelos del portal (`requests.ts`, `comms.ts`, `visits.ts` + UIs portal/backoffice), construidos en 48h.
> **Objetivo:** detectar duplicación que crece con cada módulo, casos límite / bugs reales, coherencia
> con los principios (RLS, tool-use tipado, AuditLog) y deuda estructural antes de añadir el 4º módulo.

Clasificación de cada hallazgo:
- **AHORA** = bug real o deuda que se multiplica con cada módulo nuevo (coste de no hacerlo crece).
- **DESPUÉS** = cosmético o de bajo impacto; puede esperar a un hueco.

---

## 0. TL;DR — Top-5 para ejecutar de inmediato

| # | Hallazgo | Clasif. | Impacto × Esfuerzo | Recomendación |
|---|----------|---------|--------------------|---------------|
| **H-1** | Bug de zona horaria en visitas (`getDay()` local + `getUTCHours()` UTC mezclados) | **AHORA — BUG REAL** | Alto × Bajo | **Ejecutar ya.** Rompe disponibilidad y check-in fuera de UTC. |
| **H-2** | DSAR sin guardia estructural schema↔export (el fallo que encontró el DPO puede repetirse) | **AHORA — deuda estructural** | Alto × Bajo | **Ejecutar ya.** Test estático tipo `rls-coverage` que falle si una tabla del residente no está en el export. |
| **H-3** | Condición de carrera en reserva de la última plaza de franja (`count` + `create` sin lock/constraint) | **AHORA — BUG REAL latente** | Medio-Alto × Medio | **Ejecutar ya** (constraint + transacción). Sobreventa silenciosa de franjas. |
| **H-4** | `assertFamilyLink` triplicado (+ `isFamiliarRole`, patrón email no-throw) | **AHORA — deuda que crece** | Medio × Bajo | **Ejecutar ya.** Extraer `assertFamilyAccess` y `sendEmailSafe` antes del 4º módulo. |
| **H-5** | Rate-limit en memoria sin barrido (memory leak lento del `Map`) | **AHORA — bug real menor** | Bajo-Medio × Bajo | **Ejecutar ya** (es de 10 min). Barrido perezoso o `setInterval`. |

El resto (badge genérico, partición de `dictionaries.ts`, clones de página de portal) es **DESPUÉS**:
deuda real pero no bloqueante y sin riesgo de corrección.

---

## 1. Duplicación entre los tres módulos gemelos

### H-4 · `assertFamilyLink` triplicado — AHORA (deuda que crece con cada módulo)

Existen **3 copias byte-a-byte** de la verificación de vínculo del familiar:

- `apps/web/src/server/routers/requests.ts:64-79`
- `apps/web/src/server/routers/comms.ts:100-115`
- `apps/web/src/server/routers/visits.ts:105-120`

Las tres son idénticas (`db.familyLink.findFirst({ where:{userId,residentId} })` → `FORBIDDEN`). El
4º módulo del portal añadiría una 4ª copia. Es además **el control de aislamiento por-residente más
crítico del portal** (lo que evita que un familiar vea a otro residente): que viva replicado significa
que un fix de seguridad debe aplicarse en N sitios y un test puede cubrir uno y no los otros.

Patrones hermanos también duplicados:
- **`isFamiliarRole(role)`** — definido en `comms.ts:117-120`; la misma lógica (`!hasPermission(role, …)`)
  se reescribe inline en `requests.ts` y `visits.ts` con permisos distintos por módulo.
- **Patrón email no-throw** (`try { … sendEmail … } catch { logger.warn(...) }`): **6 repeticiones**
  — `requests.ts:356-368`, `comms.ts:676-705`, `visits.ts:135-161` (helper local `sendConfirmEmail`,
  ya extraído pero solo dentro de visits), `:563-577`, `:618-631`, `:704-717`. ~10-14 líneas cada una.

**Líneas duplicadas aprox.:** ~16 (×3) de `assertFamilyLink` + ~12 (×6) del email no-throw ≈ **120 líneas**
que crecen ~50/módulo nuevo.

**Refactor mínimo (sin big-bang):**
1. `assertFamilyAccess(ctx, residentId)` en `apps/web/src/server/trpc.ts` o `apps/web/src/lib/family-access.ts`.
   Recibe `ctx` (ya tiene `db` + `session`), no `(db, userId, residentId)` — reduce el call-site a una línea
   y centraliza el mensaje de error. Sustituir las 3 copias por la llamada (cambio mecánico, 1 commit).
2. `sendEmailSafe({ to, ...content }, logContext)` en `apps/web/src/server/email/index.ts`: envuelve el
   `try/catch + logger.warn`. Convierte 12 líneas en 1 por call-site.
3. `isFamiliarFor(role, permission)` exportado una vez (p. ej. en `lib/rbac.ts`).

> Recomendación: hacer (1) y (2) **antes** de construir el 4º módulo. Son refactors mecánicos, cubiertos
> por los tests existentes de cada router (si pasan, el extract es correcto).

### H-6 · Badges casi idénticos — DESPUÉS (cosmético, generalizable)

`request-status-badge.tsx`, `visit-status-badge.tsx` y `comms-badges.tsx` repiten la misma forma:
`Record<Status, BadgeTone>` + `Record<Status, icon>` + `<Badge tone><span aria-hidden>{icon}</span>{label}</Badge>`.

- `request-status-badge.tsx:12-55`
- `visit-status-badge.tsx:12-40`
- `comms-badges.tsx:22-111`

**Generalizable** a un `<StatusBadge config={...} value={...} />` parametrizado por
`{ tone, icon, label }`, dejando cada módulo solo con su tabla de configuración. Ahorra ~40-60 líneas y
unifica el patrón de accesibilidad (WCAG 1.4.1 color+texto). **No urge:** son componentes estables, sin bug,
y el riesgo de un mal refactor visual supera el beneficio hoy. Hacerlo cuando aparezca el 4º set de badges.

### H-7 · Páginas de portal clonadas — DESPUÉS

`portal/solicitudes/page.tsx` (113), `portal/mensajes/page.tsx` (114), `portal/comunicados/page.tsx` (180),
`portal/visitas/page.tsx` (377) comparten andamiaje (cabecera, estados de carga/vacío, lista). Extraer un
`PortalListShell` ahorraría boilerplate, pero la divergencia real entre ellas (la de visitas es 3× mayor)
hace que el ROI sea menor que en backend. **DESPUÉS**, y solo si un 4º listado lo justifica.

---

## 2. Casos límite y corrección

### H-1 · Bug de zona horaria en visitas — AHORA (BUG REAL)

Hay una **mezcla incoherente de hora local del servidor y hora UTC** dentro del mismo cálculo:

- `apps/web/src/lib/visits.ts:63` → `slotsForDate` calcula el día con `date.getDay()` (**local del servidor**)…
- …`apps/web/src/lib/visits.ts:78-79` → pero compara la hora con `v.scheduledAt.getUTCHours()` (**UTC**).
- `apps/web/src/server/routers/visits.ts:386` → `s.dayOfWeek === scheduledAt.getDay()` (**local**) junto a
  `timeHHMM` derivado de `getUTCHours()/getUTCMinutes()` (líneas 381-382, **UTC**).
- `isVisitInSlot` (`lib/visits.ts:184-189`) repite el mismo defecto: `getDay()` local + `getUTCHours()` UTC.

**¿Bug real o teórico?** Real, y se manifiesta en dos planos:

1. **Inconsistencia interna (independiente del TZ del servidor):** mezclar `getDay()` (local) con
   `getUTCHours()` (UTC) es incorrecto en *cualquier* despliegue donde local≠UTC. En un servidor en
   `Europe/Madrid` (UTC+1/+2), una visita guardada a las `23:30Z` se cuenta en el `dayOfWeek` del día
   siguiente local pero con la hora `23:30` UTC → la franja nunca casa o casa con el día equivocado.
2. **`checkInByCode` "es HOY" se rompe a medianoche:** `visits.ts:773-778` compara
   `new Date().toISOString().slice(0,10)` (fecha **UTC**) contra `visit.scheduledAt` (UTC). El comentario
   del propio código (`scheduledAt es HOY`, líneas 741-742) asume "hoy" del centro. Para una visita de las
   `00:30` del 13-jun hora de Madrid (`22:30Z` del 12-jun en verano), entre las `22:00Z` y `24:00Z` el
   "hoy UTC" ya es 12-jun mientras en Madrid es 13-jun: el código QR válido se rechaza con el error genérico
   `Código no válido para hoy.` La recepción ve un QR legítimo rechazado en la franja nocturna.

**Mitigación recomendada (fix dirigido, no reescritura):**
- Decidir **una sola** convención y aplicarla en todo el módulo. Recomiendo fijar **`Europe/Madrid` como
  TZ del centro** (el MVP es España; multi-TZ es roadmap) y derivar día-de-semana y HH:MM **siempre en esa
  TZ** con `Intl.DateTimeFormat('es-ES',{ timeZone })` o `date-fns-tz`. Sustituir todos los `getDay()` y
  `getUTC*()` del módulo por helpers `dayOfWeekInTz(date, tz)` / `hhmmInTz(date, tz)` en `lib/visits.ts`.
- Para el check-in, comparar `localDateInTz(now, tz) === localDateInTz(scheduledAt, tz)`.
- Cubrir con tests de `lib/visits.ts` (es lógica pura) usando fechas en franja de medianoche
  (`23:30Z`, `00:30 Madrid`) — exactamente la clase de caso que hoy no se prueba.

> Nota de diseño: la TZ del centro debería vivir en `Center` (campo `timezone`, default `Europe/Madrid`)
> para no hard-codearla y dejar la puerta abierta a multi-país sin otro big-bang. Si se acepta, es un ADR
> corto (decisión reversible). Mientras tanto, constante única en `lib/visits.ts`.

### H-3 · Condición de carrera: última plaza de la franja — AHORA (BUG REAL latente)

`visits.ts:396-429` (`request`) hace **check-then-act sin lock**: cuenta ocupación (`count`, líneas 396-402)
y *después* inserta (`create`, 415). Dos familiares reservando la última plaza simultáneamente leen
`occupied = capacity-1` ambos y ambos crean → **sobreventa de la franja**. La capacidad no es un invariante
garantizado por la BD; es una comprobación de aplicación con ventana de carrera.

Lo mismo aplica, en menor gravedad, al **doble submit de solicitudes** (`requests.create`, sin idempotencia):
un doble click crea dos `ServiceRequest`. Menos crítico (no rompe invariante), pero ensucia la bandeja.

**Mitigaciones (por orden de robustez):**
1. **Mejor:** mover el `count` + `create` a una `$transaction` con nivel `Serializable`, o introducir una
   tabla/constraint que materialice la ocupación por `(slotConfigId, fecha)` con `UNIQUE` por nº de plaza
   o un contador con `UPDATE ... WHERE occupied < capacity` atómico. Postgres rechaza la segunda inserción.
2. **Pragmático MVP:** envolver verificación+inserción en `ctx.db.$transaction(async tx => …)` con
   `isolationLevel: 'Serializable'` y reintento ante conflicto de serialización. La capacidad de visitas es
   baja-frecuencia: el coste es despreciable.
3. Doble submit: clave de idempotencia opcional o `UNIQUE(residentId, scheduledAt, requestedById)` parcial.

> El módulo `comms.createThread`/`postMessage` **sí** usa `$transaction` (`comms.ts:455-477`, `:647-663`),
> así que el patrón ya existe en el código; aquí es coherencia: aplicarlo donde hay invariante de capacidad.

### H-8 · `lastMessageAt` / `firstResponseAt` — mayormente consistentes (DESPUÉS, observación)

- `firstResponseAt` (`requests.ts:283-288`): se setea solo cuando responde **staff** y aún era `null`.
  Correcto y coherente con REQ-005. Sin bug.
- `lastMessageAt` (`comms.ts:463`, `:658-661`): se actualiza en `createThread` y `postMessage` dentro de
  transacción. Consistente. **Salvedad menor:** ambos usan `new Date()` calculado en el router (no
  `now()` de BD); bajo reloj de servidor sesgado podría haber micro-desorden, pero es irrelevante para el
  orden de bandeja. **DESPUÉS / sin acción.**

### H-5 · Rate-limit en memoria: leak del `Map` — AHORA (bug real menor)

`apps/web/src/lib/rate-limit.ts:22` mantiene `store = new Map()` a nivel de módulo. `checkRateLimit`
(32-51) limpia los timestamps *dentro* de cada bucket, pero **nunca elimina la entrada del `Map`**: cada
`key` nueva (`checkin:${userId}`) deja un `Bucket` vacío permanente. En un proceso de vida larga con muchos
usuarios distintos de recepción, el `Map` crece de forma monótona. Es un leak lento, pero real.

**Mitigación (baja):** al filtrar, si `bucket.attempts.length === 0` hacer `store.delete(key)` en vez de
`store.set`; o un barrido perezoso (cada N llamadas) / `setInterval` que purgue buckets vacíos. ~5 líneas.
La limitación multi-instancia ya está documentada en el propio fichero (Redis EU) y es aceptable para MVP.

---

## 3. Coherencia arquitectónica

### Cumplimiento de principios en los routers nuevos — OK con un matiz

- **RLS:** los tres routers operan sobre `ctx.db` (cliente tenant-scoped) y verifican pertenencia explícita
  (`unit`/`resident`/`center` `findUnique`) además de RLS. Coherente con el principio "RLS, no solo código".
  Las tablas nuevas (`service_requests`, `visits`, `message_threads`, etc.) **sí aparecen** en el inventario
  de `rls-coverage.test.ts:260-298`, luego el aislamiento estructural está cubierto. Bien.
- **AuditLog:** todas las mutaciones relevantes llaman `ctx.audit(...)`. Coherente con ADR-0007.
  *Salvedad menor (DESPUÉS):* `markAnnouncementRead` (`comms.ts:282-316`) no audita (es una acción de bajo
  valor de auditoría — lectura propia — defendible omitirla; documentarlo basta).
- **Tool-use tipado / IA:** estos módulos no exponen herramientas al copiloto; no aplica. Sin violaciones.
- **Capas:** `lib/visits.ts` y `lib/service-requests.ts` mantienen lógica pura separada de I/O — correcto,
  salvo el bug de TZ (H-1) que vive precisamente en esa capa pura y por eso es fácil de testear y arreglar.

### H-2 · DSAR sin guardia estructural schema↔export — AHORA (deuda estructural crítica)

El historial lo deja claro: el `CHANGELOG` de `packages/db/src/dsar.ts:14-30` documenta que CRÍTICO-01/02
(2026-06-12) **olvidó** incluir tablas de Fase 1 y portal en el export y la anonimización — justo lo que
encontró la auditoría DPO. Hoy se remediò a mano (export v2 con 17 colecciones, `dsar.ts:120-179`), pero
**nada impide que la próxima tabla nueva vuelva a olvidarse**: el único guardrail es la memoria del que
añade la tabla.

Los tests existentes **no cierran el agujero**:
- `dsar.integration.test.ts:19` es `describe.skipIf(!hasDb)` → en CI sin Postgres **no corre**.
- Aunque corra, comprueba tablas *concretas* (LifeStory, ConsentRecord, Visit…) una a una; una tabla
  *nueva* no listada simplemente no se testea: el test sigue verde.

**Esto es exactamente el problema que `rls-coverage.test.ts` ya resolvió para RLS:** un test estático que
parsea `schema.prisma`, extrae los modelos con `residentId` y exige que cada uno esté cubierto. Replicar ese
patrón para DSAR hace el olvido **estructuralmente imposible** (rojo en CI sin BD).

**Mecanismo propuesto — `dsar-coverage.test.ts` (estático, sin BD), en `packages/db/test/`:**
1. Reutilizar el parser de `rls-coverage.test.ts` (`extractNextModelBlock`/`parseTenantModels`) generalizado
   para extraer modelos que declaren un campo `residentId` (directo) o relación al residente.
2. Definir un **registro central explícito** de "tablas del residente" y su tratamiento DSAR, p. ej.
   `RESIDENT_DATA_TABLES` en `packages/db/src/dsar-registry.ts`:
   ```
   { model: 'Visit', export: true, onAnonymize: 'clearPII' | 'delete' | 'keep' }
   ```
   `exportResidentData` y `anonymizeResident` **derivan de ese registro** (o, mínimo, el test compara el
   registro contra el schema).
3. El test falla si: existe un modelo con `residentId` en el schema que **no** está en el registro, o que
   está marcado `export:true` pero su colección no aparece en el shape de `ResidentExport`.
4. Marcar exclusiones explícitas (tablas con `residentId` que deliberadamente NO se exportan, p. ej. tablas
   puramente derivadas) con un allow-list comentado — igual que se haría con RLS.

> Beneficio: la **próxima** tabla con datos de residente no compila el CI hasta que su autor decida
> conscientemente export/anonimización. Convierte un fallo de memoria (que ya costó una incidencia DPO) en
> un fallo de compilación. Esfuerzo bajo: el 80% del parser ya existe y está probado.

> Decisión de negocio pendiente (no la tomo yo): el *qué* se conserva vs borra en anonimización sigue atado
> a Q-003 (Angel). El registro es ortogonal: estructura el *mecanismo*, no la política.

---

## 4. i18n — partición de `dictionaries.ts`

`apps/web/src/i18n/dictionaries.ts` tiene **1.880 líneas / 95 KB** con dos objetos planos gigantes
(`es`, `ca`). Crece monótonamente con cada módulo y los merges concurrentes (auth + Fase 1 + portal en la
misma sesión) son terreno fértil de conflictos de git. Clasificación: **DESPUÉS** (no hay bug; es
ergonomía y velocidad de equipo), pero con un plan barato que no toca la API pública.

**La API `translate(locale, key, vars)` (`dictionaries.ts:`) consume `DICTIONARIES: Record<Locale, Record<string,string>>`.**
Mientras `DICTIONARIES` siga siendo ese mapa plano, **la API no cambia** — ni `provider.tsx` (`useT`) ni
`server.ts` (`getT`). La partición es interna:

**Propuesta (sin romper `translate()`):**
1. Crear `apps/web/src/i18n/dict/` con un fichero por dominio: `auth.ts`, `centers.ts`, `residents.ts`,
   `care.ts`, `portal-requests.ts`, `portal-comms.ts`, `portal-visits.ts`, `expediente.ts`… Cada uno exporta
   `{ es: {...}, ca: {...} }` con sus claves namespaced (el namespace por punto ya existe: `signup.*`,
   `exp.*`, etc., así que la partición es natural por prefijo).
2. `dictionaries.ts` queda como **índice de composición**:
   ```ts
   export const DICTIONARIES = {
     es: { ...authDict.es, ...centersDict.es, ... },
     ca: { ...authDict.ca, ...centersDict.ca, ... },
   };
   ```
   `translate()` no se toca.
3. Añadir a `dictionaries.test.ts` una aserción de **paridad de claves es↔ca por módulo** (hoy probablemente
   se valida sobre el objeto monolítico; al partir, validar por fichero evita que un módulo nuevo entre con
   claves desbalanceadas).

Coste: ~1-2h mecánicas. Beneficio: PRs por módulo dejan de chocar en un fichero de 1.9k líneas. Reversible.

---

## 5. Resumen priorizado (impacto × esfuerzo)

| ID | Hallazgo | Fichero:línea | Clasif. | Acción |
|----|----------|---------------|---------|--------|
| H-1 | TZ: `getDay()` local + `getUTC*()` UTC mezclados | `lib/visits.ts:63,78,184-189`; `routers/visits.ts:381-386,773-778` | **AHORA-BUG** | TZ única (`Europe/Madrid`) vía helpers; tests de medianoche |
| H-2 | DSAR sin guardia schema↔export | `packages/db/src/dsar.ts:120-179`; gap en `dsar.integration.test.ts:19` | **AHORA-deuda estruct.** | `dsar-coverage.test.ts` + registro `RESIDENT_DATA_TABLES` |
| H-3 | Carrera última plaza (`count`+`create`) | `routers/visits.ts:396-429` | **AHORA-BUG latente** | `$transaction` Serializable / constraint de capacidad |
| H-4 | `assertFamilyLink` ×3 + email no-throw ×6 + `isFamiliarRole` | `requests.ts:64`; `comms.ts:100,117`; `visits.ts:105,135` | **AHORA-deuda crece** | `assertFamilyAccess(ctx,id)` + `sendEmailSafe()` |
| H-5 | Leak del `Map` de rate-limit | `lib/rate-limit.ts:22,38-50` | **AHORA-bug menor** | `delete` de buckets vacíos / barrido |
| H-6 | Badges casi idénticos ×3 | `request-status-badge.tsx`, `visit-status-badge.tsx`, `comms-badges.tsx` | DESPUÉS | `<StatusBadge config>` genérico |
| H-7 | Páginas de portal clonadas | `app/(app)/portal/*/page.tsx` | DESPUÉS | `PortalListShell` si llega 4º listado |
| H-8 | `lastMessageAt`/`firstResponseAt` | `requests.ts:283`; `comms.ts:463,658` | DESPUÉS | Consistentes; sin acción |
| H-9 | `dictionaries.ts` monolítico (1.9k líneas) | `i18n/dictionaries.ts` | DESPUÉS | Partir en `i18n/dict/*` sin tocar `translate()` |

**Recomendación de ejecución inmediata (top-5): H-1, H-2, H-3, H-4, H-5.** H-1 y H-3 son bugs reales que
afectan a producción fuera de UTC y a la integridad de aforo; H-2 evita reincidir en la incidencia DPO con
coste casi nulo (el parser ya existe); H-4 paga la deuda *antes* del 4º módulo que la triplicaría otra vez;
H-5 es trivial y elimina un leak. El resto (H-6, H-7, H-9) es deuda sana que puede esperar a un hueco; H-8
no requiere acción.

**Escalado pendiente a CIO/Angel (decisiones de negocio, no de arquitectura):**
- TZ del centro como campo en `Center` (H-1) vs constante única → decisión reversible, propongo ADR corto.
- Política de retención/anonimización (Q-003) que parametriza el registro de H-2.
