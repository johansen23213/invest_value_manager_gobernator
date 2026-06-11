# ADR 0014 — Rol de aplicación no-propietario para que RLS se enforce de verdad

- **Estado:** Aceptada
- **Fecha:** 2026-06-11
- **Hito:** INC-1 (Blindar el aislamiento RLS en CI)
- **Relacionada:** enmienda ADR-0002 (RLS multitenant). A-003 / Q-004 (OVHcloud).

## Contexto

INC-1 arregló el build del CI (Turbo no propagaba `DATABASE_URL`/`AUTH_SECRET`;
resuelto con `globalPassThroughEnv` en `turbo.json`). Por **primera vez** se ejecutaron
en CI los tests de integración de aislamiento RLS (`packages/db/test/rls.test.ts`)
contra el Postgres real de servicio. **Fallaron** (run #53, commit f4f7905):

- "sin contexto de tenant no se ve ninguna fila (falla en cerrado)" → esperaba 0, obtuvo 3 (`rls.test.ts:81`).
- "centros y residentes aislados por RLS" → `dbB.center.findMany()` esperaba 0, obtuvo 1 (`rls.test.ts:103`).

### Causa raíz (confirmada por lectura de código)

PostgreSQL **ignora Row-Level Security para usuarios SUPERUSER, incluso con
`ENABLE` + `FORCE ROW LEVEL SECURITY`**. (`FORCE` somete al *propietario* de la tabla a
RLS, pero **no** somete a un superusuario; son dos exenciones distintas.)

- En el servicio `postgres:16-alpine` del CI, `POSTGRES_USER=vetlla` se crea como
  **superusuario** (comportamiento de la imagen oficial de Postgres). `.env.example` y
  `docker-compose.yml` usan ese mismo rol `vetlla`.
- La app conecta con un **único rol** vía `DATABASE_URL`. La datasource de Prisma fija
  `url = env("DATABASE_URL")` (`packages/db/prisma/schema.prisma:13`) y el cliente
  (`packages/db/src/client.ts`) es un único `PrismaClient` sin selección de URL.
- Por tanto, en CI, **tanto `forTenant` como `asPlatformAdmin` conectan como superusuario**,
  y RLS se salta por completo: por eso las consultas que deberían estar aisladas devuelven filas.

El **mecanismo de bypass de plataforma es correcto y se mantiene**: es por **GUC**
(`app.bypass_rls`), no por privilegios de rol. `forTenant` envuelve cada operación en una
transacción que ejecuta
`set_config('app.tenant_id', …, TRUE), set_config('app.bypass_rls', …, TRUE)`
(`packages/db/src/rls.ts:29-32`), y las políticas leen esos GUC
(`current_setting('app.bypass_rls', TRUE) = 'on' OR tenant_id = current_setting('app.tenant_id', TRUE)`,
p. ej. `20260607010000_rls_tenant_isolation/migration.sql`). `asPlatformAdmin()` = `forTenant({ tenantId: null, bypassRls: true })`.

**Por qué en H1 (local) pasaban los tests:** el rol de Postgres usado localmente **no
era superusuario**, así que `FORCE` sí aplicaba. **No es una regresión** de los sprints
recientes: estos tests **nunca** se habían ejecutado en CI (el build siempre estuvo rojo).
El gate de INC-1 hizo exactamente su trabajo: destapar que el aislamiento se saltaba.

**Por qué importa más allá del CI:** el invariante #1 del producto (un tenant nunca ve
datos de otro) **no se enforce-a** si la app conecta como superusuario. Es un riesgo de
seguridad latente **de cara a producción**, no solo un problema de CI. ADR-0002 ya lo
anticipó ("un solo rol con FORCE… en producción se valorará un rol de app no propietario").

## Decisión

**Introducir un rol de aplicación no-propietario, `NOSUPERUSER NOBYPASSRLS`**, con GRANTs
de solo CRUD, **distinto del rol que aplica migraciones** (owner). Concretamente:

1. **Dos roles, dos cadenas de conexión:**
   - `DATABASE_URL` → rol **owner** (`vetlla`): aplica migraciones y seed (DDL + ownership).
   - `APP_DATABASE_URL` → rol **app** (`vetlla_app`): runtime de la app (`forTenant`,
     `asPlatformAdmin`) y los tests de integración RLS.
2. **El rol de app es `NOSUPERUSER NOBYPASSRLS`** y solo tiene `SELECT, INSERT, UPDATE,
   DELETE` sobre las tablas (no es propietario), de modo que **FORCE no hace falta para
   que RLS aplique**: un no-propietario no-superusuario siempre queda sujeto a RLS.
   (Mantenemos `FORCE` como defensa en profundidad; no estorba.)
3. **El bypass de plataforma sigue siendo por GUC** (`app.bypass_rls`), no por privilegios.
   `asPlatformAdmin()` sigue funcionando con el rol de app: la política lo permite porque
   lee el GUC, no porque el rol tenga `BYPASSRLS`. Esto es **deseable**: el superadmin de
   plataforma sigue sujeto a una política auditable y explícita, no a un privilegio implícito.
4. **Prisma usa una sola datasource pero dos URLs por contexto:** la datasource sigue
   declarando `env("DATABASE_URL")` para que `prisma migrate`/`generate` operen como owner;
   el **cliente runtime** (`packages/db/src/client.ts`) instancia Prisma con
   `datasourceUrl: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL` (override
   programático en el constructor). El fallback a `DATABASE_URL` preserva el comportamiento
   actual donde no haya rol de app aún (degradación, no rotura).

### Propuesta de SQL del rol (idempotente; corre como owner)

```sql
-- Rol de aplicación: NO propietario, NO superusuario, NO bypass de RLS.
-- Se crea/actualiza de forma idempotente. La contraseña se inyecta por entorno
-- (psql -v) y NUNCA se commitea.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    EXECUTE format('CREATE ROLE vetlla_app LOGIN PASSWORD %L', :'app_password');
  ELSE
    EXECUTE format('ALTER ROLE vetlla_app LOGIN PASSWORD %L', :'app_password');
  END IF;
END $$;

ALTER ROLE vetlla_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Acceso al schema y CRUD sobre tablas existentes y futuras.
GRANT USAGE ON SCHEMA public TO vetlla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetlla_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vetlla_app;

-- Que las tablas/secuencias creadas DESPUÉS por el owner hereden los grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetlla_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vetlla_app;
```

> Nota: `ALTER DEFAULT PRIVILEGES` solo cubre objetos creados por el rol que lo ejecuta
> (el owner). Como las migraciones corren como owner, las tablas futuras heredan grants.
> Tras cada migración que cree tablas, leo-devops debe **re-aplicar** este script (o el
> bloque `GRANT … ON ALL TABLES`) por seguridad — es idempotente.

### Dónde vive el SQL del rol

**Script de bootstrap (`packages/db/prisma/sql/app-role.sql`), NO una migración Prisma.**
Razón: el rol de app y sus grants son **infraestructura de la base de datos**, no parte del
schema versionado por Prisma. Una migración Prisma:
- mezclaría gestión de roles/credenciales (que dependen del entorno) con DDL del schema;
- ejecutaría `CREATE ROLE` como parte de `migrate deploy`, lo que en OVHcloud gestionado
  puede no estar permitido (el proveedor a veces no concede `CREATEROLE` al usuario base);
- forzaría a tener la contraseña del rol disponible en cada `migrate deploy`.

Mantenerlo como script de bootstrap separado permite ejecutarlo una vez (o tras cada
migración para refrescar grants) con las credenciales adecuadas, y que en OVHcloud lo
provisione Angel/operaciones si el proveedor no deja crear roles desde el cliente (Q-004).

## Alternativas consideradas

- **Quitar `BYPASSRLS`/superuser al rol único `vetlla` en CI** (sin crear rol de app):
  resolvería el síntoma en CI, pero el rol seguiría siendo **propietario** de las tablas;
  bastaría `FORCE` y funcionaría. **Descartada como solución final** porque no refleja
  producción (donde el rol de app NO debe ser owner, por mínimo privilegio) y dejaría CI
  divergente del runtime real. Sí la usamos como verificación: confirma la causa raíz.
- **Base de datos / rol de migración con `BYPASSRLS` y app con GUC** (lo actual): el
  problema no es el GUC, es que **superuser ignora RLS**. Mantener un único rol superusuario
  para todo es precisamente lo que falla.
- **No-op + documentar el riesgo:** inaceptable; deja el invariante #1 sin enforce en prod.
- **Una sola URL con `SET ROLE vetlla_app` por transacción:** evitaría la segunda cadena,
  pero acopla el bypass a cambiar de rol en caliente y complica el pooling; la doble URL es
  más explícita y se alinea con cómo se separan credenciales en producción.

## Consecuencias

- **El aislamiento se enforce de verdad** en CI y en producción: la app no puede saltarse
  RLS ni con un olvido de `where tenantId`, porque su rol no puede bypassear RLS.
- **Coste:** una segunda variable de entorno (`APP_DATABASE_URL`) y un script de bootstrap
  que leo-devops ejecuta tras migraciones. Reversible (si falta `APP_DATABASE_URL`, el
  cliente cae a `DATABASE_URL`).
- **El bypass de plataforma queda más limpio:** auditable por política GUC, sin depender de
  un privilegio `BYPASSRLS` implícito en el rol.
- **INC-1 NO se cierra** con esto solo: el gate RLS debe **pasar en CI** con el rol de app
  conectando como `APP_DATABASE_URL`. Hasta entonces, INC-1 pasa a "fix de rol app en curso".
- **OVHcloud (A-003 / Q-004):** hay que verificar si el Postgres gestionado permite crear
  el rol de app desde el cliente o si lo provisiona el proveedor/operaciones. Se escala a
  Angel como parte de Q-004 (ver open_question).
- ADR-0002 queda **enmendado**: donde decía "un solo rol con FORCE… se reconsiderará en
  producción", la reconsideración es **esta ADR**; el modelo de producción es rol de app
  no-propietario `NOSUPERUSER NOBYPASSRLS`.
