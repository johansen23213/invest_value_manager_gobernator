# Auditoría de Seguridad y RGPD — Vetlla MVP
**Fecha:** 2026-06-14  
**Auditora:** Sofía (DPO/Seguridad)  
**Metodología:** Lectura estática de código, migraciones SQL y tests. Sin ejecución de BD ni build.

---

## Resumen ejecutivo

| Severidad | Nº hallazgos |
|-----------|-------------|
| Crítico   | 1           |
| Alto      | 4           |
| Medio     | 4           |
| Bajo      | 3           |
| **Total** | **12**      |

El aislamiento multitenant (RLS + FORCE en todas las tablas, rol `vetlla_app` NOBYPASSRLS) y la arquitectura DSAR están bien construidos y son sólidos. El AuditLog es genuinamente inmutable (REVOKE DELETE + trigger). El mayor riesgo operativo es que el secreto TOTP se almacena en claro (TODO documentado pero sin fecha). El riesgo RGPD más inmediato es la falta de guard de permiso explícito en varios endpoints `tenantProcedure` que realizan comprobaciones manuales de rol, creando superficie para errores futuros.

---

## Tabla de hallazgos

### CRITICO

| ID | Severidad | Título | Evidencia | Impacto | Recomendación |
|----|-----------|--------|-----------|---------|---------------|
| C-01 | Crítico | Secreto TOTP en claro en BD | `packages/db/prisma/schema.prisma:71` (`mfaSecret String?`); `packages/db/prisma/migrations/20260614100000_mfa_and_login_lockout/migration.sql:36` (`"mfa_secret" TEXT`); `apps/web/src/server/routers/mfa.ts:120` | Si la BD es exfiltrada (dump, backup comprometido, acceso de soporte), el atacante obtiene todos los secretos TOTP y puede generar códigos válidos indefinidamente para cualquier usuario con MFA. El MFA deja de ser un segundo factor real. Categoría especial de datos (art. 9 RGPD) porque los usuarios son personal sanitario con acceso a expedientes. | Cifrar la columna con column-level encryption antes de activar MFA en producción (no en QA). Opciones: pgcrypto con clave derivada de KMS, o Vault Transit. El TODO en código (`TODO Q-SEC`) existe pero no tiene fecha ni ticket. Bloquear la activación de MFA en producción hasta resolver. |

---

### ALTO

| ID | Severidad | Título | Evidencia | Impacto | Recomendación |
|----|-----------|--------|-----------|---------|---------------|
| A-01 | Alto | `requests.get` y `addComment` usan `tenantProcedure` con comprobación manual de permiso | `apps/web/src/server/routers/requests.ts:176-184` y `224` | El endpoint `requests.get` usa `tenantProcedure` (solo exige sesión + tenant) y luego hace una comprobación manual: `if (!hasPermission(role, 'requests:create') && !hasPermission(role, 'requests:manage'))`. Si se añade un rol nuevo (p. ej. un rol de solo-auditoría), podría acceder a solicitudes sin que el autor se dé cuenta. El patrón es más frágil que `permissionProcedure` y no es coherente con el resto del codebase. `addComment` tiene el mismo patrón (línea 224). | Convertir a `permissionProcedure`. Como el endpoint sirve a dos roles con permisos distintos, crear una `anyPermissionProcedure(['requests:create', 'requests:manage'])` o dividir en dos endpoints. |
| A-02 | Alto | `comms.closeThread` y `reopenThread` usan `tenantProcedure` con guard manual de rol | `apps/web/src/server/routers/comms.ts:721,761` | Mismo patrón: comprobación `hasPermission(role, 'comms:read') && !isFamiliarRole(role)` dentro de `tenantProcedure`. El helper `isFamiliarRole` es una función interna que puede quedar desincronizada con la RBAC real si se añaden roles. | Consolidar en `permissionProcedure('comms:broadcast')` o crear `comms:manage` para estas operaciones de staff. |
| A-03 | Alto | `visits.availability` y `visits.cancel` usan `tenantProcedure` con comprobación manual | `apps/web/src/server/routers/visits.ts:233,629` | `availability` hace `!hasPermission(role, 'visits:request') && !hasPermission(role, 'visits:manage')` manualmente. Si se añade un rol futuro sin esos permisos podría consultar la agenda. `cancel` tiene el mismo patrón. | Usar `permissionProcedure`. |
| A-04 | Alto | `actividades.portal.participationForResident` abierto a cualquier rol autenticado para no-familiares | `apps/web/src/server/routers/actividades.ts:393-417` | El endpoint usa `tenantProcedure` (no `permissionProcedure`). Para el FAMILIAR aplica `assertFamilyAccess`. Para cualquier otro rol autenticado (incluido un usuario sin tenant:read, por ejemplo un test con rol incorrecto), devuelve la participación en actividades de cualquier residente del tenant. La protección de facto es RLS (limita al tenant) pero no hay guardia de permiso `activities:read`. | Añadir `permissionProcedure('activities:read')` como base; para el FAMILIAR añadir la lógica de `assertFamilyAccess` dentro. |

---

### MEDIO

| ID | Severidad | Título | Evidencia | Impacto | Recomendación |
|----|-----------|--------|-----------|---------|---------------|
| M-01 | Medio | `ANTHROPIC_API_KEY` declarada en `env.ts` sin proveedor que la consuma y sin guardia UE | `apps/web/src/env.ts:8` | La variable está declarada (opcional, default vacío) pero ningún proveedor en `packages/ai` la consume hoy. Si en el futuro se cablea un cliente Anthropic directo (api.anthropic.com, fuera de la UE), la validación de entorno ya la acepta silenciosamente. Riesgo de residencia de datos RGPD art. 44. | Eliminar `ANTHROPIC_API_KEY` de `env.ts` hasta que se cablee explícitamente un proveedor. Cuando se cablee, asegurar que sea vía Bedrock EU (`eu-central-1`) o Vertex EU (`europe-west*`), nunca `api.anthropic.com`. Documentar en ADR. |
| M-02 | Medio | `lockout` solo por cuenta, no por IP — brute-force distribuido no se mitiga | `apps/web/src/lib/login-lockout.ts:23-24` | El lockout es 5 intentos / 15 min POR CUENTA. Un atacante con IPs rotatorias puede probar contraseñas sobre cuentas de distintos usuarios sin activar el bloqueo de ninguna. No hay rate-limit por IP en la capa de autenticación. | Añadir rate-limit en el endpoint de login por IP (p. ej. con `@upstash/ratelimit` o un middleware Redis). El rate-limit existente en `src/lib/rate-limit.ts` debería aplicarse también al endpoint de auth. |
| M-03 | Medio | Trigger de inmutabilidad del AuditLog solo bloquea a `vetlla_app`, no a otros roles futuros | `packages/db/prisma/migrations/20260612130000_audit_logs_immutable_delete/migration.sql:27-37` | El trigger `audit_logs_no_delete` comprueba `current_user = 'vetlla_app'`. Si se crea un rol futuro (ej. `vetlla_reporting`) con DELETE sobre la tabla, el trigger lo dejaría pasar. La política `REVOKE DELETE ON public.audit_logs FROM vetlla_app` solo cubre ese rol. | Cambiar el trigger a política de lista blanca: solo permitir DELETE al owner `vetlla` (para cascade de tenant) y denegar a cualquier otro. O crear el trigger como `SECURITY DEFINER` con comprobación inversa: si `current_user != 'vetlla'` entonces RAISE EXCEPTION. |
| M-04 | Medio | Recovery codes de MFA: no hay límite de intentos en `verifySecondFactor` | `apps/web/src/server/routers/mfa.ts:56-82` | La función `verifySecondFactor` itera sobre todos los recovery codes disponibles (`findMany where usedAt: null`) y prueba cada hash. Un atacante con sesión (post-password) podría intentar recovery codes a velocidad de la red sin límite. El lockout de `auth.ts` solo aplica al paso de contraseña, no al paso MFA. | Añadir rate-limit o lockout específico para el segundo factor. Como mínimo, limitar los intentos MFA fallidos en el mismo flujo de `authorize` (auth.ts) aplicando `registerFailure` también en `MFA_INVALID`. |

---

### BAJO

| ID | Severidad | Título | Evidencia | Impacto | Recomendación |
|----|-----------|--------|-----------|---------|---------------|
| B-01 | Bajo | `redactFields` en logger no cubre el campo `codeHash` ni `mfaSecret` si se loguean como error | `apps/web/src/server/logger.ts:14-15` | El patrón de redacción cubre `token` y `secret` (cubre `mfaSecret`, `clientSecret`, `authToken`). Cubre `password`. Pero `codeHash` no coincide con ningún patrón. Si en un catch futuro alguien pasa `{ codeHash: e.message }` al logger, saldría en claro. Riesgo actual bajo (no hay log con esos campos), pero la cobertura es incompleta. | Añadir `hash` al patrón de FORBIDDEN_KEY_PATTERN. |
| B-02 | Bajo | `audit.ts` de la capa DB captura `console.error` en lugar de `logger.error` | `packages/db/src/audit.ts:37` | Los fallos de `logAudit` van a `console.error` directamente, sin pasar por `redactFields`. Si el `entry` tuviese campos PII en `metadata`, el stacktrace podría filtrar información. En producción `console.error` va al log de infraestructura sin sanitización. | Usar el `logger` de la aplicación o, como mínimo, redactar los campos del `entry` antes de loguear el error. En el contexto de `@vetlla/db` (paquete sin dependencia de la app), bastaría con `console.error('[audit] error', entry.action, entry.entity)` sin el objeto entero. |
| B-03 | Bajo | `UPPCuring` tiene `tenantId` pero no aparece en la lista esperada de `rls-coverage.test.ts` | `packages/db/prisma/schema.prisma:1087` (`UPPCuring.tenantId`); `packages/db/test/rls-coverage.test.ts:261-322` | `UPPCuring` tiene `tenantId` en el schema, pero NO aparece en el array `expectedKnown` del test de cobertura RLS (línea 261-322). El test de inventario esperado (`expectedKnown`) no incluye `upp_curings`. Esto significa que aunque la tabla tenga RLS (verificable solo en BD), el test de cobertura no la valida explícitamente por nombre — podría pasar inadvertida en una BD nueva. NOTA: la migración SÍ incluye `upp_curings` en el bloque DO $$ con ENABLE+FORCE+POLICY (migración `20260611200000_expediente_fase1`). El fallo es en el test de inventario esperado, no en la migración. | Añadir `'upp_curings'` al array `expectedKnown` de `rls-coverage.test.ts:261-322`. Verificación dinámica pendiente para confirmar que la política existe en BD real. |

---

## Verificado en código estático (sin BD)

Los siguientes controles están implementados correctamente y se verificaron en código:

- **RLS ENABLE + FORCE + policy**: todas las tablas con `tenantId` revisadas tienen su migración correspondiente. El patrón GUC `app.tenant_id` + `app.bypass_rls` es consistente en todas las migraciones.
- **Rol `vetlla_app` NOSUPERUSER NOBYPASSRLS**: `app-role.sql` y `app-role-bootstrap.sql` configuran correctamente el rol. El problema del REVOKE en BD nueva (CIO descubrió) tiene solución documentada en `app-role-bootstrap.sql` (crear el rol antes de migrate).
- **AuditLog inmutable**: REVOKE DELETE (migración `20260612130000`) + trigger UPDATE (migración `20260607115400`) + trigger DELETE para `vetlla_app`. Defensa en profundidad correcta.
- **DSAR registry exhaustivo**: todos los modelos con `residentId` están en `RESIDENT_DATA_TABLES`. El test `dsar-coverage.test.ts` hace cross-check schema↔registry↔dsar.ts.
- **MFA recovery codes**: hasheados con SHA-256. Los códigos planos solo se devuelven una vez. `usedAt` en lugar de DELETE (trazabilidad).
- **Portal de familias**: `assertFamilyAccess` centralizado, verificado en `requests.create`, `requests.listMine`, `requests.get` (para FAMILIAR), `inventario.listMine`, `actividades.participationForResident` (para FAMILIAR).
- **Minimización en copiloto**: `redactPii` aplicado antes de enviar texto al modelo. El utterance crudo no se guarda en AuditLog (solo la versión seudonimizada). El modelo nunca toca BD directamente.
- **Residencia UE IA**: los únicos proveedores cableados son `vllm` (endpoint configurable), `bedrock` (esqueleto, región EU forzada en config), `vertex` (esqueleto, location EU forzada). No hay llamadas a `api.anthropic.com`.
- **Email transaccional**: `ConsoleEmailProvider` falla explícitamente en `NODE_ENV=production`. Proveedor HTTP solo acepta URLs configuradas.
- **Secretos en git**: `.env` está en `.gitignore` y no está versionado (verificado con `git ls-files`).
- **MfaRecoveryCode** con `tenantId = ''` para SUPERADMIN: el bypass_rls activo para SUPERADMIN evita que la política RLS bloquee el acceso. Lógica correcta aunque el string vacío como tenantId es un antipatrón menor.

## Pendiente de verificación dinámica (requiere BD real)

- **B-03**: confirmar que `upp_curings` tiene política RLS activa en `pg_policies` del catálogo de BD.
- **C-01**: confirmar que `mfa_secret` no está cifrado en columna en la BD de staging (si existe).
- **Todos los REVOKE y triggers**: verificar con `SELECT` en `information_schema.role_table_grants` y `pg_trigger` que efectivamente están aplicados.
- **forTenant transaction isolation**: verificar con `SHOW transaction_isolation` que las transacciones que fijan el GUC no tienen race conditions entre `set_config` y la query.
- **AdmissionRequest DSAR para candidatos NO admitidos**: la política de retención (Q-003) está sin definir. Pendiente de decisión CIO/Angel — no hay mecanismo automatizado para candidatos rechazados.

---

## DPIA / RoPA — estado de cumplimiento

| Área | Estado | Acción requerida |
|------|--------|-----------------|
| Aislamiento multitenant | CONFORME | — |
| Minimización copiloto (redactPii) | CONFORME | — |
| AuditLog inmutable | CONFORME | — |
| DSAR art. 15/17 | CONFORME | Pendiente política retención candidatos no admitidos (Q-003) |
| Secreto TOTP en reposo | NO CONFORME | C-01: cifrar antes de producción |
| Residencia UE IA | CONFORME (actual) | M-01: eliminar ANTHROPIC_API_KEY de env.ts para evitar cablerío accidental |
| MFA lockout segundo factor | PARCIALMENTE CONFORME | M-04: añadir rate-limit en paso MFA |
| Registro de actividad (art. 30 RoPA) | EN CURSO | AdmissionRequest política retención Q-003 pendiente |
