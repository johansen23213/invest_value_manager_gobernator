-- ---------------------------------------------------------------------------
-- Bootstrap del rol de aplicación — se ejecuta ANTES de `prisma migrate deploy`.
--
-- Por qué: varias migraciones referencian el rol `vetlla_app` (GRANT/REVOKE,
-- p. ej. 20260612130000 hace `REVOKE DELETE ON audit_logs FROM vetlla_app`).
-- En una base de datos NUEVA el rol todavía no existe cuando corren las
-- migraciones, y `migrate deploy` falla con "role vetlla_app does not exist".
-- En local no se ve porque el rol ya está creado de antes.
--
-- Solución (orden de arranque correcto, también para producción):
--   1) Este bootstrap crea el rol (LOGIN + password) SIN grants sobre tablas.
--   2) `prisma migrate deploy` aplica el schema (las migraciones ya encuentran el rol).
--   3) `app-role.sql` concede CRUD sobre las tablas YA creadas (idempotente).
--
-- Se ejecuta como OWNER (vetlla). La contraseña se inyecta por psql
-- (-v app_password=...) y NUNCA se commitea.
-- ---------------------------------------------------------------------------

-- Crear el rol si no existe (sin password aquí: estamos dentro de $$).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    CREATE ROLE vetlla_app LOGIN;
  END IF;
END $$;

-- Atributos + contraseña (fuera del bloque: psql interpola :'app_password').
-- NOSUPERUSER NOBYPASSRLS es esencial para que RLS se enforce (ADR-0014).
ALTER ROLE vetlla_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
