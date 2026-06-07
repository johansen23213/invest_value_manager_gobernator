-- RLS para audit_logs (aislamiento por tenant) + inmutabilidad (append-only).

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "audit_logs"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- Inmutabilidad: el registro de auditoría no se puede modificar. Se bloquea UPDATE
-- a nivel de base de datos. (DELETE se permite para el borrado en cascada del tenant
-- y la retención RGPD; el borrado individual no se expone en la aplicación.)
CREATE OR REPLACE FUNCTION audit_logs_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es inmutable: no se permite UPDATE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_update();
