# ADR 0002 — Aislamiento multitenant con Row-Level Security

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H1

## Contexto

El aislamiento entre tenants es el requisito de seguridad central (datos de salud,
art. 9 RGPD). No basta con filtrar por `tenantId` en el código: un olvido en una
query expondría datos de otro centro. El aislamiento debe vivir en la base de datos.

## Decisión

- **RLS en Postgres** en todas las tablas con datos, con `FORCE ROW LEVEL SECURITY`
  para que el propietario de la tabla también quede sujeto (en este entorno la app y
  las migraciones comparten rol; FORCE es defensa en profundidad y permite verificar
  el aislamiento incluso con el rol propietario).
- **Contexto por GUC de sesión**, fijado por transacción:
  - `app.tenant_id`: tenant activo.
  - `app.bypass_rls` (`on`/`off`): elevación para SUPERADMIN de plataforma, seed y
    migraciones de datos.
- **Políticas que fallan en cerrado:** si los GUC no están fijados, `current_setting(…, TRUE)`
  devuelve NULL y no se ve ni se puede escribir ninguna fila (`USING` + `WITH CHECK`).
- **Cliente Prisma con contexto** (`forTenant` en `packages/db`): un client extension
  `$extends` envuelve cada operación de modelo en una transacción que ejecuta
  `set_config('app.tenant_id', …, TRUE)` antes de la query. `asPlatformAdmin()` activa
  el bypass.
- **La autenticación usa bypass**: el login busca por email (único, cross-tenant) antes
  de conocer el tenant, por lo que `auth.ts` usa `asPlatformAdmin()`.
- **RBAC** por rol + permiso (`apps/web/src/lib/rbac.ts`), combinado con RLS en tRPC:
  `tenantProcedure` inyecta `ctx.db` ya aislado; `permissionProcedure(p)` exige permiso.

## Alternativas consideradas

- **Solo filtrado en código (where tenantId):** descartado; un olvido = fuga de datos.
- **Rol de BD separado para la app (no propietario):** válido y más estricto, pero
  exige dos cadenas de conexión (migración vs runtime). Con `FORCE` + GUC logramos el
  mismo aislamiento verificable con un solo rol. Se reconsiderará en producción.
  **ENMENDADO (2026-06-11, ADR-0014):** la premisa "con FORCE + un solo rol basta" es
  **falsa si ese rol es SUPERUSER** — Postgres ignora RLS para superusuarios aunque haya
  `FORCE`. El CI lo destapó (rol `vetlla` = superusuario de la imagen oficial). El modelo
  de producción pasa a ser un **rol de app no-propietario `NOSUPERUSER NOBYPASSRLS`**
  (owner aplica migraciones; app y tests de RLS conectan como rol de app). Bypass de
  plataforma sigue por GUC. Ver **ADR-0014**.
- **Base de datos por tenant:** mayor aislamiento pero peor coste/operación; contra el
  principio de "alta de un centro en minutos".

## Consecuencias

- Aislamiento verificado por test a nivel de BD (`packages/db/test/rls.test.ts`):
  lectura cruzada vacía, `WITH CHECK` bloquea escritura cruzada, fallo en cerrado sin
  contexto, y bypass de superadmin. Verificado también en la API (un tenant solo ve sus
  usuarios; RBAC bloquea a quien no tiene el permiso).
- Cada nueva tabla con datos **debe** añadir `tenant_id`, habilitar RLS+FORCE y su
  política en la misma migración. (Pendiente: checklist/lint que lo garantice.)
- Coste: cada operación de modelo abre una transacción para fijar el GUC. Aceptable;
  se optimizará si hace falta (p. ej. pool con `SET` por conexión).
