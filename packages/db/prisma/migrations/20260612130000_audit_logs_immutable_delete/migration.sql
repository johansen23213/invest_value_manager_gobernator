-- CRÍTICO-03: Bloquear DELETE sobre audit_logs para el rol de aplicación.
--
-- Contexto (ADR-0007, auditoría DPO 2026-06-12):
-- El trigger audit_logs_immutable ya bloqueaba UPDATE. Sin embargo, el rol
-- vetlla_app tenía DELETE concedido (vía GRANT ALL TABLES en app-role.sql).
-- Un atacante que comprometa la sesión de la app podría borrar trazas de
-- auditoría — precisamente el escenario que el AuditLog debe prevenir.
--
-- Solución de defensa en profundidad:
--   1. REVOKE DELETE sobre la tabla (permiso de BD revocado).
--   2. Trigger BEFORE DELETE que lanza excepción (defensa adicional; cubre
--      también a otros roles que en el futuro puedan recibir DELETE por error).
--
-- NOTA: el borrado en cascada al eliminar un Tenant (Tenant.onDelete: Cascade)
-- se ejecuta como el rol OWNER (vetlla), no como vetlla_app, por lo que sigue
-- funcionando. El borrado lógico de datos RGPD (anonymizeResident, art. 17)
-- no toca audit_logs (el AuditLog es inmutable por diseño).

-- 1) Revocar DELETE al rol de aplicación.
REVOKE DELETE ON public.audit_logs FROM vetlla_app;

-- 2) Trigger de defensa en profundidad: bloquea DELETE para el rol de aplicación
--    (vetlla_app). Los roles con privilegios superiores (owner, postgres) pueden
--    hacer DELETE para el cascade de borrado de tenants en tests y mantenimiento.
--    Esto preserva la invariante "la app no puede borrar trazas" sin romper
--    el CASCADE ON DELETE de la FK audit_logs -> tenants.
CREATE OR REPLACE FUNCTION audit_logs_no_delete()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'vetlla_app' THEN
    RAISE EXCEPTION 'audit_logs es inmutable: no se permite DELETE desde vetlla_app';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_no_delete();
