-- RLS para family_links (portal de familias): mismo patrón (GUC app.tenant_id + bypass).

ALTER TABLE "family_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "family_links"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );
