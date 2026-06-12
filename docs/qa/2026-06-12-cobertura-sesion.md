# QA Coverage — Sesión 2026-06-12

Auditoría de cobertura de los módulos añadidos en la sesión:
expediente Fase 1 (Ola B), solicitudes, comunicaciones, visitas, auth reset/invitación,
rediseño UI (ResidentChrome).

---

## Tabla de cobertura por módulo

| Módulo | Unidad / integración | e2e | Riesgo residual |
|---|---|---|---|
| Solicitudes — lógica pura (`service-requests.ts`) | ✓ 53 tests | ✓ `solicitudes.spec.ts` (4 tests) | Bajo |
| Solicitudes — portal familiar (`/portal/solicitudes`) | — | ✓ FAM-1, FAM-2 | Medio: flujo de reabrir no cubierto e2e |
| Solicitudes — bandeja staff (`/solicitudes`) | — | ✓ STF-1, STF-2 | Bajo |
| Comunicados — lógica pura (`announcements.ts`) | ✓ 22 tests | ✓ `comunicaciones.spec.ts` (4 tests) | Bajo |
| Comunicados — publicar (staff) | — | ✓ COM-PUB | Medio: filtros por unidad/residente no cubiertos e2e |
| Comunicados — portal familiar (`/portal/comunicados`) | — | ✓ COM-ACK | Alto: el acuse es idempotente en el seed (puede ya estar confirmado en CI) |
| Mensajería — portal familiar (`/portal/mensajes`) | — | ✓ COM-MSG1 | Medio: creación de nuevo hilo no cubierta e2e |
| Mensajería — bandeja staff (`/comunicacion/mensajes`) | — | ✓ COM-MSG2 | Bajo |
| Visitas — lógica pura (`visits.ts`) | ✓ 47 tests | ✓ `visitas.spec.ts` (4 tests) | Bajo |
| Visitas — portal familiar (`/portal/visitas`) | — | ✓ VIS-FAM1, VIS-FAM2 | Alto: check-in positivo NO verificable (visita DEMOQR01 es futura, no de hoy) |
| Visitas — agenda staff (`/visitas`) | — | ✓ VIS-STF1, VIS-CHK-NEG | Alto: check-in positivo (scheduledAt=hoy) requiere fixture específico de hoy |
| Expediente Fase 1 — chips de seguridad (`resident-chrome.tsx`) | Parcial (lógica en componente, sin test unitario de SafetyChips) | ✓ EXP-1 | Medio: la lógica `SafetyChips` vive en TSX, no en lib pura; no es unitaria |
| Expediente — pestañas nuevas (Cuidados, Clínico+, Administrativo) | — | ✓ EXP-2 | Bajo: se verifican pestañas; la escritura de datos (dieta, UPP) no está cubierta e2e |
| Formateo fechas (`format.ts`) | ✓ 25 tests (nuevo) | — | Bajo |
| Auth reset / invitación (`/recuperar`, `/restablecer`, `/registro`) | Parcial (`auth-schema.test.ts` 3 tests) | ✗ Sin spec e2e | **Alto**: flujo completo reset-password y alta de centro no verificados e2e |
| Rediseño UI ResidentChrome (avatar, edad calculada, GRAVE banner) | — (render visual) | ✓ indirectamente via EXP-1 | Medio: regresión visual no detectada por texto |
| MAR / prescripción | ✓ mar.test.ts + mar-ui.test.ts (42 tests) | ✓ pre-existentes (11 tests) | Bajo |
| RBAC / equipo | ✓ rbac.test.ts + rbac-labels.test.ts (18 tests) | ✓ pre-existentes (8 tests) | Bajo |
| Copiloto | ✓ copilot.test.ts (40 tests) | ✓ pre-existentes (6 tests) | Bajo |
| RLS multitenancy | ✓ rls-coverage.test.ts (113 tests) | ✗ Sin test de BD real en este entorno | **Crítico**: RLS no verificado sin Postgres |
| Alertas de medicación | ✓ alerts.test.ts (6 tests) | — | Bajo |
| Ocupación | ✓ occupancy.test.ts (6 tests) | — | Bajo |
| Escales valoración | ✓ scales.test.ts (28 tests) | — | Bajo |
| Planes/pricing | ✓ plans.test.ts | — | Bajo |
| AuditLog | ✓ indirectamente en RLS tests | ✗ Sin e2e específico | Medio: visibilidad de auditoría en /auditoria cubierta por auditoria.spec.ts pre-existente |
| Conflictos de sincronización offline | ✓ care-merge.test.ts (5 tests) | — | Medio: resolución en entorno real con IndexedDB no cubierta |
| Franjas de visita (`/visitas/franjas`) | — | ✗ Sin spec e2e | Medio: CRUD de franjas no cubierto |

---

## Totales post-sesión

| Suite | Antes | Después |
|---|---|---|
| `@vetlla/web` unit tests | 340 | **365** (+25) |
| `@vetlla/db` tests | 242 | 242 (sin cambios) |
| Specs e2e (Playwright `--list`) | 35 | **49** (+14) |

---

## Lo que NO se pudo verificar en este entorno

### 1. e2e sin navegador (sin Chromium real)
Todos los specs de `apps/web/e2e/*.spec.ts` están escritos y enumerados correctamente
por `playwright test --list`, pero NO se ejecutaron con browser real. La suite completa
debe correr en CI con `PW_CHROMIUM` configurado. Riesgo principal:

- `COM-ACK`: el acuse del seed puede estar ya confirmado en la primera ejecución;
  el spec cubre ambos casos (botón visible / ya confirmado), pero debe verificarse
  que la lógica de acuse es idempotente en la BD.

- `VIS-FAM2`: el selector de franja (`select[name="slotConfigId"]` o radiogroup)
  depende de la implementación real del componente `/portal/visitas/nueva`.
  Si el componente usa un patrón distinto al que el spec intenta, fallará en CI.
  Revisar `/apps/web/src/app/(app)/portal/visitas/nueva/page.tsx` antes del primer run.

- `VIS-CHK-NEG` / check-in positivo: el servidor rechazará DEMOQR01 porque
  `scheduledAt` es el próximo sábado. Para probar el check-in positivo en CI se
  necesita una visita con `scheduledAt = hoy`. Esto se puede lograr con un fixture
  adicional en el seed o parametrizando el seed con la fecha de ejecución.

### 2. RLS sin PostgreSQL
Los 113 tests de `rls-coverage.test.ts` verifican aislamiento en un cliente Prisma
mock/stub. El aislamiento RLS **real** (Postgres `SET LOCAL vetlla.tenant_id`) no
está verificado en este entorno. Se requiere una instancia de Postgres con RLS
habilitado para el green check definitivo del criterio de aceptación de multitenancy.

### 3. Lógica `SafetyChips` en componente
La función `SafetyChips` (cabecera sticky, chips de dieta/textura/dispositivos)
vive en `resident-chrome.tsx` como función interna, no en `lib/`. No tiene test
unitario puro. Candidato a extraer a `lib/safety-chips.ts` para poder testear sin
render (p. ej. cuándo aparece el chip ámbar de dieta vs cuándo no).

---

## Top-3 riesgos residuales

1. **Check-in de visita positivo no cubierto e2e**: la visita CONFIRMADA del seed
   es siempre futura (próximo sábado). El path positivo del check-in (que genera
   `checkInAt`, transiciona a EN_CURSO, emite toast de éxito con el nombre del
   residente) nunca se ejecuta en los tests actuales. Si el router tiene un bug en
   esa rama (p. ej. RLS sobre el `visit.update` del check-in), no se detectará
   hasta producción.

2. **RLS sin Postgres real**: el aislamiento multitenant es el criterio de aceptación
   más crítico del MVP. Los 113 tests de `rls-coverage.test.ts` pasan con cliente
   mock, pero no verifican que las políticas `SET LOCAL vetlla.tenant_id` estén
   correctamente aplicadas en Postgres real. Un tenant que cuela datos de otro es
   un fallo catastrófico para una residencia sanitaria (RGPD art. 9).

3. **Acuse de comunicado idempotente en CI serial**: el spec `COM-ACK` hace click
   en "Confirmar que lo he leído" si el botón está visible. En CI, si los tests
   corren en orden serial y el acuse se persiste en BD entre tests (el seed no
   borra receipts), el botón podría no aparecer en la segunda ejecución del spec
   en el mismo run. El spec cubre este caso con un branch, pero no verifica que
   el campo `acknowledgedAt` se actualiza en BD — solo que el botón desaparece
   de la UI.
