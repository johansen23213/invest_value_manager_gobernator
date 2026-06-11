-- RLS para las tablas de H2 (mismo patrón que H1: GUC app.tenant_id + bypass).
-- Cada tabla con datos: ENABLE + FORCE + política de aislamiento por tenant_id.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'centers',
    'units',
    'beds',
    'residents',
    'emergency_contacts',
    'allergies',
    'diagnoses',
    'assessments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (current_setting(''app.bypass_rls'', TRUE) = ''on''
                OR tenant_id = current_setting(''app.tenant_id'', TRUE))
         WITH CHECK (current_setting(''app.bypass_rls'', TRUE) = ''on''
                OR tenant_id = current_setting(''app.tenant_id'', TRUE));',
      t
    );
  END LOOP;
END $$;
