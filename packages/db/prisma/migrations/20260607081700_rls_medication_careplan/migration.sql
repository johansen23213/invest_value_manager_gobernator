-- RLS para las tablas de H4 (medicación y PIA): mismo patrón (GUC app.tenant_id + bypass).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'medications',
    'medication_administrations',
    'care_plans',
    'care_plan_goals',
    'care_plan_reviews'
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
