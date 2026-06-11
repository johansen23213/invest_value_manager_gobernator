# ADR 0005 — Medicación (MAR) y PIA

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H4

## Contexto

H4 añade prescripción de medicación con registro de administración (MAR) y alertas
de no-administrado, más el Plan Individualizado de Atención (PIA) con objetivos y
seguimiento.

## Decisión

- **Prescripción (`Medication`)** con `times` (horas de pauta "HH:MM"), periodo de
  vigencia (`startDate`/`endDate`) y `active`.
- **MAR sin pre-generar dosis.** En lugar de crear filas de administración por
  adelantado (scheduler), la pauta del día se **calcula** (`computeSchedule`) a partir de
  las medicaciones activas y las administraciones existentes. Una administración solo se
  materializa cuando alguien la registra.
- **Alerta de no-administrado derivada**: una dosis sin registro y pasada la hora + una
  gracia (60 min) se marca `NO_ADMINISTRADO`. La lógica es **pura** (`apps/web/src/lib/mar.ts`),
  testeada sin BD. `alertsToday` agrega las alertas del tenant para el panel.
- **Idempotencia del registro**: `MedicationAdministration` es único por
  `(tenant_id, medication_id, scheduled_at)`. Registrar/corregir una dosis es un `upsert`,
  no duplica.
- **PIA**: `CarePlan` → `CarePlanGoal` (estado) + `CarePlanReview` (seguimiento). Preparado
  para que el copiloto de IA redacte borradores de objetivos/revisión en H5.
- **RLS+FORCE** en las 5 tablas nuevas; **RBAC**: `medication:prescribe` (sanitario/dirección),
  `medication:administer` (también auxiliar: el MAR es su trabajo), `careplan:write`
  (sanitario/dirección).

## Alternativas consideradas

- **Pre-generar administraciones (cron/scheduler):** más infraestructura y filas; el cálculo
  on-the-fly evita un job de fondo y mantiene el MVP simple. Si se necesitan recordatorios
  push o histórico denso, se reconsiderará.

## Consecuencias

- Acceptance cubierto: prescribir y ver alertas de no-administración. Verificado end-to-end:
  prescripción → dosis NO_ADMINISTRADO (alerta) → administración (por auxiliar) → resuelto;
  RBAC bloquea prescribir al auxiliar.
- La pauta calculada asume horas locales del servidor; multi-zona y pautas complejas
  (días alternos, "si precisa") quedan para iteración posterior.
