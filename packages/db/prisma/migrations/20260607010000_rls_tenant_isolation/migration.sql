-- Row-Level Security (RLS) para aislamiento multitenant.
--
-- Modelo: la aplicación fija dos GUC locales por transacción:
--   * app.tenant_id  -> tenant activo
--   * app.bypass_rls -> 'on' solo para SUPERADMIN de plataforma / seed
--
-- Las políticas fallan en cerrado: si los GUC no están fijados, no se ve ni se
-- puede escribir ninguna fila. FORCE asegura que incluso el propietario de la
-- tabla queda sujeto a RLS (en este entorno la app y las migraciones comparten rol).

-- tenants ---------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tenants"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR id = current_setting('app.tenant_id', TRUE)
  );

-- users -----------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "users"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );
