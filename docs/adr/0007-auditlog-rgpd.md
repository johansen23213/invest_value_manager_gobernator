# ADR 0007 — Registro de actividad (AuditLog) para RGPD

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

Criterio de aceptación del MVP (§12 del spec): *"Toda acción sobre datos personales queda
en AuditLog"*. Datos de salud (art. 9 RGPD) exigen trazabilidad de quién hace qué, cuándo y
sobre qué entidad, con un registro **inmutable**.

## Decisión

- **Modelo `AuditLog`** con `tenant_id`, `actor_id`, `actor_email` (desnormalizado para
  trazabilidad estable aunque cambie el usuario), `action`, `entity`, `entity_id`,
  `summary`, `metadata` (Json) y `created_at`. RLS+FORCE como el resto de tablas.
- **Inmutabilidad a nivel de base de datos:** trigger `BEFORE UPDATE` que lanza excepción
  (`audit_logs es inmutable`). El `DELETE` se permite (borrado en cascada del tenant y
  retención RGPD); el borrado individual no se expone en la aplicación.
- **Helper `logAudit(db, entry)`** en `packages/db`: inserta con el cliente acotado al
  tenant (respeta RLS). No lanza: si falla, registra el error pero no rompe la operación de
  negocio (la auditoría no debe bloquear el cuidado).
- **`ctx.audit(...)` en `tenantProcedure`** (tRPC): registrar es una línea por mutación,
  con el actor y el tenant del request inyectados automáticamente.
- **Cobertura:** alta/edición de residente, sub‑recursos del expediente (contacto, alergia,
  diagnóstico, valoración), prescripción y administración de medicación (MAR), PIA y
  revisiones, sincronización de atención directa, e **inicio de sesión** (en `auth.ts`).
- **Lectura:** router `audit.list` + página `/auditoria`, con permiso `audit:read`
  (dirección y superadmin). Aislado por RLS; un tenant solo ve su actividad.

## Consecuencias

- Criterio de aceptación cubierto. Verificado: login y prescripción generan traza; un tenant
  no ve la de otro; el `UPDATE` está bloqueado por el trigger; el auxiliar no puede leer la
  auditoría (FORBIDDEN). Tests: integración (escritura, RLS, inmutabilidad) + RBAC.
- El `actor_email` se guarda desnormalizado a propósito (la traza debe sobrevivir a cambios
  o bajas del usuario).
- Pendiente/hardening: política de **retención** configurable, exportación para el derecho
  de acceso, y endurecer el `DELETE` (rol restringido) si se requiere inmutabilidad total.
