# ADR 0009 — Modelo de pauta de medicación extendido (Sprint M)

- **Estado:** Aceptada
- **Fecha:** 2026-06-09
- **Relacionado:** ADR 0005 (medicación/MAR/PIA), `docs/ux/medicacion-y-rbac.md`
  (diseño UX priorizado, ítems M-05/M-06/M-07), `apps/web/src/lib/mar.ts`
  (`computeSchedule`). Origen: análisis competitivo de ResiPlus.

## Contexto

El modelo actual de `Medication` cubre lo mínimo (nombre, `dose` String, `route`
String libre, `times` Json de `"HH:MM"`, fechas, instrucciones). El rediseño UX
de medicación (sección 2.2 del diseño) y el análisis de ResiPlus identifican
carencias que bloquean una prescripción y un MAR realistas:

1. **Vía de administración** como texto libre → ambigüedad clínica (oral, sc, im…).
2. **Forma farmacéutica/unidad** ausente (comprimido, solución, parche…).
3. **Pauta por días de la semana** imposible (hoy solo horas) → no se puede pautar
   "solo lunes, miércoles y viernes".
4. **Medicación a demanda (PRN / "si precisa")** no representable: toda toma exige hora.

La pregunta de diseño: **¿dónde modelar la pauta extendida?** Dos opciones:

- **A. Campos en `Medication`** (Json + enums en la propia fila).
- **B. Tabla separada `MedicationSchedule`** (una fila por pauta, relación 1‑N).

## Decisión

Para el MVP, **opción A: extender `Medication` in situ**, de forma no destructiva:

- `route`: pasa de `String?` libre a **enum `MedicationRoute`**
  (`ORAL, SUBLINGUAL, SUBCUTANEA, INTRAMUSCULAR, INTRAVENOSA, TOPICA, INHALATORIA,
TRANSDERMICA, RECTAL, OCULAR, NASAL, OTRA`). Migración con mapeo de los valores
  existentes (p. ej. "oral" → `ORAL`; lo no reconocido → `OTRA`).
- `unit`: nuevo `String?` (forma farmacéutica). Se deja como texto controlado por
  un `Select` en UI; se valorará enum si se estabiliza el catálogo.
- `daysOfWeek`: nuevo `Json?` = array `[0–6]` (0 = domingo). `null` = todos los días.
- `type`: nuevo **enum `MedicationType`** (`CRONICO, AGUDO, PRN`). `PRN` = a demanda.

`times` (`Json` de `"HH:MM"`) **se mantiene como fuente primaria** de la pauta
horaria; `computeSchedule` añade el filtrado por `daysOfWeek` y excluye de la
agenda fija las medicaciones `PRN` (que se registran cuando ocurren).

### Lo que NO entra aquí (diferido a backlog, con su propio ADR si procede)

- `momentDoses` (dosis por franja mañana/mediodía/tarde/noche) — ítem M‑11.
- Cabecera `Treatment` que agrupe líneas — ítem M‑09.
- `diagnosisId` (vínculo a patología) — ítem M‑10.
- Soporte **offline del MAR** para administraciones — requiere análisis de
  conflictos propio (LWW no es trivial para "administrado/no administrado");
  pendiente de ADR específico.

> El campo `User.jobTitle` (R‑01, etiqueta de función) es de RBAC, no de
> medicación, y se aborda en la Wave B del Sprint M (no en este ADR).

## Razonamiento

- **Reversibilidad:** todos los campos nuevos son `null`-ables y no rompen el MAR
  actual; `computeSchedule` ya tiene tests (`mar.test.ts`) que deben seguir verdes.
- **Evitar normalización prematura:** una tabla `MedicationSchedule` (opción B) es
  más limpia a largo plazo, pero añade joins y complejidad que el MVP no necesita.
  La migración A→B en el futuro es mecánica y de bajo riesgo si llega el caso.
- **Seguridad clínica:** normalizar `route` a enum elimina ambigüedad; el tipo `PRN`
  evita falsos "no administrados" para medicación a demanda.

## Consecuencias

- Migración Prisma no destructiva salvo la normalización de `route` (con mapeo de
  datos existentes y actualización del `seed`).
- Actualizar el input Zod de `medications.prescribe` y los formularios.
- `computeSchedule` y sus tests amplían cobertura para `daysOfWeek` y `PRN`.
- Si en el futuro se requiere granularidad por franja o cabecera de tratamiento, se
  retoman M‑09/M‑10/M‑11 sobre esta base.
