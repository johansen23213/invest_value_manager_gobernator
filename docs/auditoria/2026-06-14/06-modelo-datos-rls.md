# Auditoría — Modelo de datos, RLS+FORCE y correctitud backend
**Fecha:** 2026-06-14  
**Auditor:** Núria (backend Vetlla) — adversarial, solo lectura  
**Alcance:** schema.prisma + todas las migraciones + rls.ts + dsar-registry.ts  
**Entorno:** sin Postgres disponible; los catálogos pg_policies/pg_class no pueden consultarse.  
Los hallazgos se basan en análisis estático de migraciones. Los marcados con (*PG*) requieren verificación contra BD real para considerarse cerrados.

---

## Resumen ejecutivo

El modelo de datos es sólido en su mayoría. El patrón RLS (ENABLE+FORCE+WITH CHECK+USING por GUC) está aplicado coherentemente en las 59 tablas con `tenant_id`. El test estático `rls-coverage.test.ts` cubre la presencia de los tres elementos RLS por tabla en texto de migración.

Se identifican **5 hallazgos Críticos/Altos** y **6 hallazgos Medios/Bajos**:

- **CRIT-01:** `auth_tokens` accesible cross-tenant en runtime real con `vetlla_app` porque la tabla no tiene RLS y el rol tiene SELECT/INSERT/UPDATE sobre ella via `GRANT ALL TABLES`.
- **CRIT-02:** La tabla `medication_sync_conflicts` tiene `WITH CHECK` pero la política RLS no cubre el caso de un INSERT donde `tenant_id` difiere del de la administración padre — la integridad de tenant solo la garantiza el check directo de la columna, que no existe como constraint FK cruzada.
- **ALTO-01:** `app-role.sql` ejecuta `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES` que incluye `auth_tokens`. La migración `20260612130000` hace REVOKE de DELETE en `audit_logs` pero no hace REVOKE de nada en `auth_tokens`. El rol `vetlla_app` queda con todos los permisos sobre una tabla sin RLS que contiene tokens de reset de contraseña e invitaciones cross-tenant.
- **ALTO-02:** La numeración correlativa de facturas usa `FOR UPDATE` con `SERIALIZABLE` pero dentro de la transacción activa `bypass_rls` incondicionalmente con `set_config('app.bypass_rls','on',TRUE)`. Esto significa que si la función `forTenant` es llamada concurrentemente desde otro tenant en el mismo proceso, el GUC de sesión se puede "contaminar" — aunque `TRUE` en `set_config` lo limita a la transacción actual. Riesgo real bajo pero el bypass incondicional rompe la invariante de "RLS siempre activa para vetlla_app".
- **ALTO-03:** El control de aforo de `ActivityEnrollment` (check read-then-write de plazas) se hace en código de aplicación sin transacción serializable ni SELECT FOR UPDATE. Dos peticiones concurrentes pueden superar el aforo.

---

## Tablas con RLS+FORCE completo

Todas las 59 tablas con `tenant_id` tienen ENABLE+FORCE+USING+WITH CHECK en sus migraciones correspondientes según el análisis estático. No se detecta ninguna tabla faltante. El test `rls-coverage.test.ts` lo verifica en CI sin BD.

Tabla de inventario RLS verificado estáticamente:

| Tabla | ENABLE | FORCE | POLICY (USING) | WITH CHECK | Migración |
|---|---|---|---|---|---|
| tenants | SI | SI | SI | SI | 20260607010000 |
| users | SI | SI | SI | SI | 20260607010000 |
| centers | SI | SI | SI | SI | 20260607011500 |
| units | SI | SI | SI | SI | 20260607011500 |
| beds | SI | SI | SI | SI | 20260607011500 |
| residents | SI | SI | SI | SI | 20260607011500 |
| emergency_contacts | SI | SI | SI | SI | 20260607011500 |
| allergies | SI | SI | SI | SI | 20260607011500 |
| diagnoses | SI | SI | SI | SI | 20260607011500 |
| assessments | SI | SI | SI | SI | 20260607011500 |
| care_records | SI | SI | SI | SI | 20260607080000 |
| sync_conflicts | SI | SI | SI | SI | 20260607080000 |
| medications | SI | SI | SI | SI | 20260607081700 |
| medication_administrations | SI | SI | SI | SI | 20260607081700 |
| care_plans | SI | SI | SI | SI | 20260607081700 |
| care_plan_goals | SI | SI | SI | SI | 20260607081700 |
| care_plan_reviews | SI | SI | SI | SI | 20260607081700 |
| family_links | SI | SI | SI | SI | 20260607083100 |
| audit_logs | SI | SI | SI | SI | 20260607115400 |
| treatments | SI | SI | SI | SI | 20260611100000 |
| medication_sync_conflicts | SI | SI | SI | SI | 20260611090000 |
| mfa_recovery_codes | SI | SI | SI | SI | 20260614100000 |
| resident_devices | SI | SI | SI | SI | 20260611200000 |
| vaccines | SI | SI | SI | SI | 20260611200000 |
| weight_records | SI | SI | SI | SI | 20260611200000 |
| pressure_ulcers | SI | SI | SI | SI | 20260611200000 |
| upp_curings | SI | SI | SI | SI | 20260611200000 |
| fall_records | SI | SI | SI | SI | 20260611200000 |
| restraints | SI | SI | SI | SI | 20260611200000 |
| consent_records | SI | SI | SI | SI | 20260611200000 |
| life_stories | SI | SI | SI | SI | 20260611200000 |
| service_requests | SI | SI | SI | SI | 20260612100000 |
| service_request_comments | SI | SI | SI | SI | 20260612100000 |
| announcements | SI | SI | SI | SI | 20260612110000 |
| announcement_receipts | SI | SI | SI | SI | 20260612110000 |
| message_threads | SI | SI | SI | SI | 20260612110000 |
| messages | SI | SI | SI | SI | 20260612110000 |
| visit_slot_configs | SI | SI | SI | SI | 20260612120000 |
| visits | SI | SI | SI | SI | 20260612120000 |
| nursing_notes | SI | SI | SI | SI | 20260613100000 |
| medical_notes | SI | SI | SI | SI | 20260613100000 |
| discharge_records | SI | SI | SI | SI | 20260613200000 |
| social_reports | SI | SI | SI | SI | 20260613200000 |
| wellbeing_profiles | SI | SI | SI | SI | 20260613200000 |
| menu_items | SI | SI | SI | SI | 20260613210000 |
| intake_records | SI | SI | SI | SI | 20260613210000 |
| shift_templates | SI | SI | SI | SI | 20260613220000 |
| shift_assignments | SI | SI | SI | SI | 20260613220000 |
| shift_handovers | SI | SI | SI | SI | 20260613220000 |
| push_subscriptions | SI | SI | SI | SI | 20260614110000 |
| tariffs | SI | SI | SI | SI | 20260614120000 |
| resident_billing_profiles | SI | SI | SI | SI | 20260614120000 |
| invoices | SI | SI | SI | SI | 20260614120000 |
| invoice_lines | SI | SI | SI | SI | 20260614120000 |
| admission_requests | SI | SI | SI | SI | 20260614200000 |
| activities | SI | SI | SI | SI | 20260614210000 |
| activity_sessions | SI | SI | SI | SI | 20260614210000 |
| activity_enrollments | SI | SI | SI | SI | 20260614210000 |
| assistive_devices | SI | SI | SI | SI | 20260614220000 |
| inventory_items | SI | SI | SI | SI | 20260614230000 |
| inventory_movements | SI | SI | SI | SI | 20260614230000 |
| resident_belongings | SI | SI | SI | SI | 20260614230000 |

---

## Tabla de hallazgos

| ID | Severidad | Categoría | Descripción | Fichero:línea | Impacto |
|---|---|---|---|---|---|
| CRIT-01 | CRÍTICO | RLS ausente en auth_tokens | `auth_tokens` no tiene RLS ni `tenant_id`. El rol `vetlla_app` tiene SELECT/INSERT/UPDATE sobre ella vía `GRANT ALL TABLES`. Un usuario autenticado como cualquier tenant puede, a través de un bug de aplicación, leer hashes de tokens de cualquier otro usuario de cualquier tenant. | `20260611120000_auth_tokens/migration.sql` — sin RLS; `prisma/sql/app-role.sql:33` | Compromiso de tokens de reset de contraseña e invitación cross-tenant |
| CRIT-02 | CRÍTICO | Aforo de actividades no serializado | `actividades.ts:261-273`: read count → decide INSCRITO/LISTA_ESPERA → write. Sin transacción serializable ni `SELECT FOR UPDATE`. Dos solicitudes concurrentes para la misma sesión pueden inscribir a más residentes que `maxCapacity`. | `apps/web/src/server/routers/actividades.ts:238-290` | Violación de aforo de actividades |
| ALTO-01 | ALTO | vetlla_app con permisos amplios sobre auth_tokens | `app-role.sql` otorga `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`. `auth_tokens` no tiene RLS. Solo se revoca DELETE en `audit_logs`. El rol `vetlla_app` puede leer/escribir tokens de reset de CUALQUIER usuario sin filtro de tenant. | `prisma/sql/app-role.sql:33` — no hay REVOKE sobre auth_tokens | Escalada de privilegios a cuenta de cualquier usuario |
| ALTO-02 | ALTO | bypass_rls incondicional en issueInvoice | `facturacion.ts:485`: `set_config('app.bypass_rls','on',TRUE)` dentro de la transacción serializable. Se usa `TRUE` (local a la transacción), lo que es correcto en aislamiento, pero el patrón rompe la trazabilidad: si en el futuro alguien cambia a `FALSE` o reutiliza este patrón con `set_config` de sesión, la RLS cae para todas las queries. Además, la selección del MAX sin SET de `app.tenant_id` depende del bypass global para que la query no sea bloqueada por RLS. | `apps/web/src/server/routers/facturacion.ts:477-509` | Patrón frágil: si el bypass se propaga fuera de la transacción, un tenant ve facturas de otro |
| ALTO-03 | ALTO | upp_curings: tenant_id no verificado cruzado con parent | `upp_curings` tiene su propio `tenant_id` y RLS directa. Pero la FK a `pressure_ulcers` no impone que `upp_curings.tenant_id = pressure_ulcers.tenant_id`. Un INSERT malintencionado o con bug podría poner una cura de un tenant en una UPP de otro tenant (la RLS del INSERT en `upp_curings` solo comprueba el `tenant_id` de `upp_curings`, no el de `pressure_ulcers`). Mismo patrón en: `sync_conflicts→care_records`, `medication_sync_conflicts→medication_administrations`, `care_plan_goals→care_plans`, `care_plan_reviews→care_plans`, `invoice_lines→invoices`. (*PG* — requiere prueba contra BD) | Schema patrón general para tablas hijas con tenant_id propio + FK al padre | Cross-tenant write parcial en tablas hijas si la capa de aplicación falla |
| MEDIO-01 | MEDIO | audit_logs sin FK a tenants — 'PLATFORM' no filtrable | Migración `20260612140000`: se elimina la FK de `audit_logs.tenant_id→tenants(id)`. Los logs de plataforma usan el sentinela `'PLATFORM'`. La política RLS filtra por `tenant_id = current_setting('app.tenant_id')`, pero si alguien fija `app.tenant_id='PLATFORM'` (string), vería todos los logs de plataforma. El riesgo es bajo porque requiere acceso para fijar GUC, pero es un vector no contemplado. | `20260612140000_audit_log_tenant_fk_optional/migration.sql` | Exposición potencial de logs de operaciones de plataforma |
| MEDIO-02 | MEDIO | users.tenantId nullable sin RLS especial para SUPERADMIN | El SUPERADMIN tiene `tenantId=null` (schema:62). La política RLS de `users` filtra `tenant_id = current_setting('app.tenant_id')`. Con `tenant_id=NULL` y `app.tenant_id=''` (lo que fija `forTenant` cuando `tenantId=null`), la comparación `NULL = ''` es FALSE en SQL. El SUPERADMIN solo puede operar con `bypass_rls=on`. Si por cualquier bug el SUPERADMIN opera sin bypass, no ve a ningún usuario. El riesgo de fuga es bajo (fail-closed), pero el riesgo de invisibilidad del propio SUPERADMIN puede ser un vector de denegación de servicio lógico. | `packages/db/src/rls.ts:22` (`tenantId ?? ''`) | SUPERADMIN invisible si bypass no activo — no es fuga sino bloqueo |
| MEDIO-03 | MEDIO | Invoice.resident onDelete: Restrict puede bloquear baja de residente | `Invoice.resident: Resident @relation(onDelete: Restrict)`. Si un residente tiene facturas emitidas (ISSUED/PAID), intentar borrar al residente falla con FK violation. El router de `discharge` no borra el residente, solo cambia status=BAJA, así que en práctica normal no hay problema. Pero la función `anonymizeResident` (art. 17 RGPD) que llama a `delete` en Resident fallará si hay facturas (se hace 'scrub' sobre Invoice pero el Resident con restrict se borra después). | `schema.prisma:2214` + `dsar-registry.ts:242` (Invoice: 'scrub' but Resident: eventual delete) | DSAR art. 17 falla silenciosamente para residentes con facturas; obligación legal incumplida |
| MEDIO-04 | MEDIO | Índice compuesto (tenant_id, recordedAt) faltante en care_records | `care_records` tiene índice por `tenant_id` y por `resident_id` separados, pero no un índice compuesto `(tenant_id, recorded_at)`. Con alto volumen (miles de registros de constantes por tenant), la consulta "últimos registros del turno" (que filtra por tenant + ventana temporal) necesitará un seq-scan del partición de tenant o un index-scan ineficiente. | `schema.prisma:755` — `@@index([tenantId])`, `@@index([residentId])` pero no `@@index([tenantId, recordedAt])` | Degradación de rendimiento en centros grandes |
| BAJO-01 | BAJO | DSAR: CarePlanGoal y CarePlanReview no declarados en dsar-registry | `CarePlanGoal` y `CarePlanReview` tienen `residentId` indirecto (via `carePlanId→CarePlan.residentId`) pero no tienen `residentId` directo. Están fuera del registro DSAR. El test estático solo busca `residentId` directo. Sin embargo, contienen datos personales del residente (objetivos de cuidado, revisiones firmadas). Si CarePlan se borra en art. 17, el CASCADE borra Goals y Reviews, así que el borrado es correcto. Pero en exportación art. 15 no aparecen. | `schema.prisma:934-965` + `dsar-registry.ts` — ausencia de CarePlanGoal/CarePlanReview | Exportación DSAR incompleta |
| BAJO-02 | BAJO | SyncConflict: reviewedById sin FK | `SyncConflict.reviewedById: String?` y `MedicationSyncConflict.reviewedById: String?` son strings libres sin FK a `users`. Si el usuario revisor es eliminado, el campo queda como dangling reference. El AuditLog tiene `actorEmail` desnormalizado por esta razón, pero SyncConflict no. | `schema.prisma:771,903` | Pérdida de trazabilidad de revisiones de conflictos |

---

## Detalle de hallazgos Críticos/Altos

### CRIT-01 — auth_tokens sin RLS (CRÍTICO)

**Evidencia:**  
`packages/db/prisma/migrations/20260611120000_auth_tokens/migration.sql` — crea la tabla sin ningún bloque de RLS.  
`prisma/sql/app-role.sql:33` — `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetlla_app`.

**Justificación de diseño declarada:** "Infraestructura de auth cross-tenant: SIN tenant_id ni RLS".

**Problema:** La justificación es válida para el LOGIN (que debe buscar por email sin tenant conocido), pero el rol `vetlla_app` con permisos totales sobre `auth_tokens` sin RLS significa que cualquier bug de aplicación que permita una query arbitraria lee tokens de reset de CUALQUIER usuario de CUALQUIER tenant. Un atacante que consiga ejecutar SQL como `vetlla_app` (ej: injection en una query raw) tiene acceso completo a todos los hashes.

**Recomendación:**  
Opción A (preferida): Crear un segundo rol `vetlla_auth` con acceso exclusivo a `auth_tokens` y `users` para los flujos de autenticación, sin acceso al resto de tablas de tenant. La app de auth usa este rol; el resto del SaaS usa `vetlla_app`.  
Opción B: Añadir RLS a `auth_tokens` basado en `user_id` y el contexto de sesión (no por tenant). No da aislamiento multitenant pero sí limita la superficie. Escalar a `marc-arquitecto` para decisión de arquitectura.

---

### CRIT-02 — Aforo de actividades no serializado (CRÍTICO)

**Evidencia:**  
`apps/web/src/server/routers/actividades.ts:238-290`

```
// 3. Determinar estado (INSCRITO / LISTA_ESPERA) por aforo
const inscripciones = await ctx.db.activityEnrollment.findMany({...});  // READ
const estado = estadoInscripcion({maxCapacity}, inscripcionesInfo);       // compute
return ctx.db.activityEnrollment.create({data: {status: estado, ...}});  // WRITE
```

No hay transacción, no hay SELECT FOR UPDATE, no hay nivel de aislamiento Serializable.

**Recomendación:** Envolver las tres operaciones en `prisma.$transaction([...], {isolationLevel: 'Serializable'})` o usar un `SELECT COUNT(*) ... FOR UPDATE` sobre los enrollments de la sesión dentro de la transacción. El mismo patrón que `visits.ts:355` (que sí usa Serializable para el aforo de visitas).

---

### ALTO-01 — vetlla_app con permisos sobre auth_tokens (ALTO)

**Evidencia:**  
`prisma/sql/app-role.sql:33`: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`  
Sin REVOKE específico para `auth_tokens`.

Derivado directamente de CRIT-01 pero el vector es diferente: `app-role.sql` se aplica manualmente tras migraciones. Si se aplica sin el contexto de CRIT-01, el resultado es el mismo.

**Recomendación:** Añadir `REVOKE ALL ON public.auth_tokens FROM vetlla_app;` en `app-role.sql` (como se hace con `audit_logs` y DELETE). Requiere rol separado para auth o tratamiento explícito de la tabla.

---

### ALTO-02 — bypass_rls incondicional en issueInvoice (ALTO)

**Evidencia:**  
`apps/web/src/server/routers/facturacion.ts:485`:  
```sql
SELECT set_config('app.bypass_rls', 'on', TRUE)
```

Dentro de una transacción SERIALIZABLE que luego ejecuta `MAX(invoice_number)` sin fijar `app.tenant_id` en el GUC local primero. El filtro `WHERE tenant_id = ${ctx.tenantId}` en la query raw sí filtra por tenant, pero si se usa `tx.invoice.update` (que usa el cliente Prisma sin la extensión `forTenant`), la política RLS está desactivada para ese update.

**Riesgo concreto:** Si un bug futuro en esa transacción ejecuta una query Prisma sobre otra tabla (ej: para obtener datos de la factura), obtendrá datos sin filtro de tenant (bypass activo). Es un patrón frágil que mezcla raw SQL con Prisma en modo bypass.

**Recomendación:** Fijar `set_config('app.tenant_id', ctx.tenantId, TRUE)` además del bypass, y documentar explícitamente que el bypass es intencional y limitado a esa transacción. Alternativamente, usar una secuencia por tenant creada al dar de alta el tenant (más complejo pero elimina el bypass).

---

### ALTO-03 — Tablas hijas: tenant_id no cruzado con padre (ALTO)

**Evidencia (patrón):**  
`upp_curings.tenant_id` + FK a `pressure_ulcers(id)` sin CHECK `upp_curings.tenant_id = pressure_ulcers.tenant_id`.

Tablas afectadas por el mismo patrón:
- `upp_curings` → `pressure_ulcers`
- `sync_conflicts` → `care_records`
- `medication_sync_conflicts` → `medication_administrations`
- `care_plan_goals` → `care_plans`
- `care_plan_reviews` → `care_plans`
- `invoice_lines` → `invoices`
- `activity_enrollments` → `activity_sessions` (via session_id, sin tenant check cruzado)

**Impacto:** La política RLS en la tabla hija solo verifica su propia columna `tenant_id`. Un INSERT donde `hijo.tenant_id = 'TenantA'` pero `padre.id` pertenece a `TenantB` pasa RLS de la hija pero viola la integridad semántica. Requeriría un bug en la capa de aplicación que meta un `parentId` de otro tenant. La RLS del padre (en SELECT) solo se activa si se hace JOIN/subquery al padre.

**Recomendación (*PG*):** Añadir constraint de check cruzado en BD, o alternativamente un trigger BEFORE INSERT/UPDATE que verifique `hijo.tenant_id = parent.tenant_id`. Escalar a `marc-arquitecto` antes de implementar.

---

## Hallazgo adicional: DSAR y Invoice + Resident onDelete (MEDIO-03)

**Evidencia:**  
`schema.prisma:2214`: `resident Resident @relation(..., onDelete: Restrict)`  
`dsar-registry.ts:240-249`: Invoice → `anonymize: 'scrub'`

El flujo DSAR art. 17 (anonymizeResident) debe: (1) hacer scrub en Invoice, (2) borrar el Resident. Pero si la función scrub de Invoice no precede al delete de Resident, la FK Restrict bloqueará el delete. Si el orden es incorrecto en `dsar.ts`, el borrado fallará. Requiere revisar el orden de operaciones en `packages/db/src/dsar.ts`.

---

## Índices de rendimiento faltantes

| Tabla | Índice recomendado | Caso de uso | Severidad |
|---|---|---|---|
| care_records | (tenant_id, recorded_at) | Query "últimas constantes del turno" | MEDIO |
| audit_logs | (tenant_id, actor_id) | Búsqueda de acciones por usuario | BAJO |
| medication_administrations | (tenant_id, scheduled_at) ya existe via (tenant_id) — verificar composite | MAR diario por franja | BAJO |
| nursing_notes | (tenant_id, note_date, shift) | Traspaso de turno — ya tiene (tenant_id, note_date) | BAJO — suficiente |
| activity_enrollments | (tenant_id, session_id, status) | Conteo de aforo — falta el filtro por status | MEDIO |

---

## Conclusión

**Ninguna tabla con tenant_id carece de RLS+FORCE+política.** El aislamiento base es correcto.

Los dos Críticos afectan (1) la tabla `auth_tokens` que queda fuera del perímetro RLS con permisos amplios del rol de aplicación, y (2) la carrera de aforo en actividades. Ambos son corregibles sin cambios de schema.

Los Altos son patrones de código que deben corregirse antes de producción con carga real. Escalo CRIT-01/ALTO-01 a `marc-arquitecto` por implicación arquitectural (rol dedicado para auth).
