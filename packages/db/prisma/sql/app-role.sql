-- ---------------------------------------------------------------------------
-- Rol de aplicación NO propietario para que RLS se enforce de verdad (ADR-0014).
--
-- Por qué: PostgreSQL IGNORA Row-Level Security para SUPERUSER (incluso con
-- ENABLE+FORCE). Si la app conecta como el rol propietario/superusuario, el
-- aislamiento entre tenants se salta. La app debe conectar como un rol
-- NOSUPERUSER NOBYPASSRLS, no propietario de las tablas, con solo CRUD.
--
-- Cómo se ejecuta (como OWNER, tras aplicar las migraciones):
--   psql ... -v ON_ERROR_STOP=1 -v app_password="<pass>" -f app-role.sql
-- Es idempotente: puede re-ejecutarse (p. ej. tras cada migración que cree
-- tablas, para refrescar los GRANT sobre las tablas nuevas).
--
-- IMPORTANTE: la contraseña se inyecta por psql (-v app_password=...) y NUNCA
-- se commitea. Nota: psql NO interpola variables dentro de bloques dollar-quoted
-- ($$...$$), por eso el CREATE ROLE va sin contraseña dentro del DO y la
-- contraseña se fija con un ALTER ROLE fuera del bloque (donde sí interpola).
-- ---------------------------------------------------------------------------

-- 1) Crear el rol si no existe (sin contraseña aquí: estamos dentro de $$).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    CREATE ROLE vetlla_app LOGIN;
  END IF;
END $$;

-- 2) Atributos + contraseña (fuera del bloque: psql interpola :'app_password').
ALTER ROLE vetlla_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_password';

-- 3) Acceso al schema y CRUD sobre las tablas/secuencias EXISTENTES.
GRANT USAGE ON SCHEMA public TO vetlla_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetlla_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vetlla_app;

-- 4) Que las tablas/secuencias creadas DESPUÉS por el owner hereden los grants.
--    (ALTER DEFAULT PRIVILEGES solo cubre objetos creados por quien lo ejecuta:
--     como las migraciones corren como owner, las tablas futuras los heredan.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetlla_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vetlla_app;

-- 5) CRÍTICO-03 (auditoría DPO 2026-06-12): audit_logs es append-only.
--    El GRANT general de arriba incluye DELETE, así que lo revocamos
--    explícitamente justo después. Este bloque es IDEMPOTENTE: REVOKE es
--    seguro aunque el privilegio ya no exista (Postgres no lanza error).
--    El trigger BEFORE DELETE instalado en la migración 20260612130000
--    añade una segunda capa de defensa.
REVOKE DELETE ON public.audit_logs FROM vetlla_app;
