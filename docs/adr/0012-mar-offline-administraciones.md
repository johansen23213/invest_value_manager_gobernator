# ADR 0012 — MAR offline para administraciones de medicación

- **Estado:** Aceptada (2026-06-11 — implementado y verificado con Postgres+RLS: 7 tests puros de `mergeAdministration`, 4 de integración de `applyMedicationAdminPush` incl. aislamiento RLS de `medication_sync_conflicts`)
- **Fecha:** 2026-06-10
- **Hito:** Sprint medicación (profundización; deuda de ADR-C en `project_state.yaml`)

## Contexto

La atención directa (`CareRecord`) ya es offline-first (ADR-0004): cola en IndexedDB,
idempotencia por `clientId` y resolución last-write-wins (LWW) por campo. El pase de
medicación (MAR), en cambio, todavía se registra **online**: la mutación
`medications.record` escribe la administración directamente contra el servidor.

A pie de cama, el auxiliar muchas veces no tiene red. Una administración de medicación es
un dato clínico sensible y **sensible al tiempo** (la hora a la que se dio la dosis), por
lo que necesita las mismas garantías que `CareRecord`, pero su modelo de conflicto es
distinto: no es "el último valor de un campo gana", sino "un evento puntual (se dio /
no se dio / se rechazó una dosis concreta) que no debe duplicarse ni perderse".

## Decisión

Llevar el MAR al mismo patrón offline que `CareRecord`, con estas reglas específicas:

- **Identidad idempotente del evento:** una administración se identifica por
  `(tenantId, medicationId, scheduledAt)` — que ya es la clave única en BD. Reenviar la
  misma administración (reintentos de red) **actualiza**, no duplica. Es el equivalente al
  `clientId` de `CareRecord`, pero con significado clínico natural (la dosis de las 08:00
  de hoy de ese fármaco es una sola).
- **Cola local en IndexedDB:** las administraciones registradas sin red entran en una
  `outbox` propia y se muestran en la UI con estado `PENDIENTE_SYNC` (la clave i18n ya
  existe), de modo que el auxiliar ve que está sin sincronizar.
- **Resolución de conflictos (LWW por administración, no por campo):** si dos dispositivos
  registran la misma dosis estando offline, gana el de **timestamp de registro
  (`administeredAt`) más reciente**, y la divergencia se persiste para revisión (mismo
  espíritu que `SyncConflict`, tabla análoga o reutilizada con un discriminador de tipo).
  Razón: una administración es un hecho atómico; mezclar campos (p. ej. status de uno y
  notas de otro) produciría registros clínicos incoherentes.
- **Estados que se sincronizan:** `ADMINISTRADO`, `NO_ADMINISTRADO` (con motivo) y
  `RECHAZADO` (con motivo). El motivo viaja con el evento.
- **Lógica pura y testable en `packages/db`** (`applyMedicationAdminPush`, análoga a
  `applyCareRecordPush`): idempotente por la clave natural, acotada por RLS al tenant, y
  verifica que la medicación pertenece al tenant/residente. La fusión (`mergeAdministration`)
  es pura y se testea sin BD.
- **El cálculo del MAR sigue siendo puro** (`computeSchedule`/`computeAlerts` en
  `apps/web/src/lib/mar.ts`): la cola offline solo aporta las administraciones locales aún
  no confirmadas, que se mezclan con las del servidor para pintar el estado de cada dosis.

## Consecuencias

- **A favor:** el auxiliar registra el MAR sin red con las mismas garantías de no-duplicado
  que la atención directa; las alertas de no-administrado dejan de depender de la
  conectividad en el momento del pase.
- **En contra / coste:** una segunda cola y un segundo motor de sync (reutilizando la
  arquitectura de ADR-0004); una nueva tabla de conflictos de medicación (o un campo
  discriminador en `SyncConflict`) con su RLS+FORCE y su test de aislamiento.
- **Seguridad de datos:** ninguna PII clínica sale del dispositivo sin cifrado de transporte;
  la cola local vive en el navegador del dispositivo del centro (mismo modelo de amenaza que
  `CareRecord`).

## Implementación (2026-06-11)

- **Datos:** migración `20260611090000_medication_offline_sync` — columna `recorded_at`
  en `medication_administrations` (timestamp LWW del evento) + tabla
  `medication_sync_conflicts` (evento completo server/client + winner) con RLS
  ENABLE+FORCE+política en la propia migración.
- **Dominio:** `packages/db/src/med-sync.ts` — `mergeAdministration` (pura; LWW por
  evento, empate→servidor, divergencia clínica = status o notas) y
  `applyMedicationAdminPush` (idempotente por la clave natural, acotada por RLS).
- **API:** `medications.push` (permiso `medication:administer`), lote ≤200, audita
  solo lo que cambió el estado clínico (no los retries sin efecto).
- **Cliente:** store `medOutbox` (IndexedDB v2), `syncMedOutbox`, `enqueueMed` en el
  provider; el MAR mezcla cola local + servidor y pinta `PENDIENTE_SYNC`.
- **Tests:** 7 puros de fusión + 4 de integración con Postgres (idempotencia/retry,
  divergencia entre dispositivos con conflicto persistido, aislamiento RLS de la
  medicación y de los conflictos).
