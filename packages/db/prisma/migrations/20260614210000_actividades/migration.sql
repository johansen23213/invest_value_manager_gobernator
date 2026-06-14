-- Actividades — animación sociocultural / terapia ocupacional
--
-- Crea los enums y tablas del módulo de actividades:
--   ActivityCategory, ActivitySessionStatus, EnrollmentStatus
--   activities, activity_sessions, activity_enrollments
--
-- Todas las tablas llevan:
--   - tenant_id NOT NULL
--   - ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY
--   - Política tenant_isolation por GUC app.tenant_id (mismo patrón que el resto)
--
-- activity_enrollments tiene residentId → declarado en dsar-registry.ts.
-- activities y activity_sessions son datos de organización (sin residentId).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ActivityCategory" AS ENUM (
  'COGNITIVA',
  'FISICA',
  'SOCIAL',
  'CREATIVA',
  'SALIDA',
  'OTRA'
);

CREATE TYPE "ActivitySessionStatus" AS ENUM (
  'PROGRAMADA',
  'REALIZADA',
  'CANCELADA'
);

CREATE TYPE "EnrollmentStatus" AS ENUM (
  'INSCRITO',
  'LISTA_ESPERA',
  'CANCELADO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla activities (catálogo del centro)
-- ---------------------------------------------------------------------------

CREATE TABLE "activities" (
  "id"              TEXT                 NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"       TEXT                 NOT NULL,
  "name"            TEXT                 NOT NULL,
  "description"     TEXT,
  "category"        "ActivityCategory"   NOT NULL DEFAULT 'OTRA',
  "location"        TEXT,
  "responsible_id"  TEXT,                          -- userId del animador/TASOC (sin FK)
  "max_capacity"    INTEGER              NOT NULL DEFAULT 20,
  "duration_min"    INTEGER              NOT NULL DEFAULT 60,
  "active"          BOOLEAN              NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activities_tenant_id_idx"
  ON "activities"("tenant_id");

-- ---------------------------------------------------------------------------
-- 3. Tabla activity_sessions (programación)
-- ---------------------------------------------------------------------------

CREATE TABLE "activity_sessions" (
  "id"           TEXT                    NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT                    NOT NULL,
  "activity_id"  TEXT                    NOT NULL,
  "center_id"    TEXT,
  "unit_id"      TEXT,
  "starts_at"    TIMESTAMP(3)            NOT NULL,
  "ends_at"      TIMESTAMP(3)            NOT NULL,
  "status"       "ActivitySessionStatus" NOT NULL DEFAULT 'PROGRAMADA',
  "notes"        TEXT,
  "created_at"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_sessions_activity_id_fkey"
    FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE
);

CREATE INDEX "activity_sessions_tenant_id_idx"
  ON "activity_sessions"("tenant_id");
CREATE INDEX "activity_sessions_tenant_activity_idx"
  ON "activity_sessions"("tenant_id", "activity_id");
CREATE INDEX "activity_sessions_tenant_starts_at_idx"
  ON "activity_sessions"("tenant_id", "starts_at");

-- ---------------------------------------------------------------------------
-- 4. Tabla activity_enrollments (inscripción + asistencia)
-- ---------------------------------------------------------------------------

CREATE TABLE "activity_enrollments" (
  "id"           TEXT              NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT              NOT NULL,
  "session_id"   TEXT              NOT NULL,
  "resident_id"  TEXT              NOT NULL,
  "status"       "EnrollmentStatus" NOT NULL DEFAULT 'INSCRITO',
  "attended"     BOOLEAN,                           -- null=pendiente; true/false=registrado
  "observation"  TEXT,
  "enrolled_at"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activity_enrollments_session_resident_unique"
    UNIQUE ("session_id", "resident_id"),
  CONSTRAINT "activity_enrollments_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "activity_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "activity_enrollments_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE
);

CREATE INDEX "activity_enrollments_tenant_id_idx"
  ON "activity_enrollments"("tenant_id");
CREATE INDEX "activity_enrollments_tenant_session_idx"
  ON "activity_enrollments"("tenant_id", "session_id");
CREATE INDEX "activity_enrollments_tenant_resident_idx"
  ON "activity_enrollments"("tenant_id", "resident_id");

-- ---------------------------------------------------------------------------
-- 5. Triggers para updated_at automático
-- ---------------------------------------------------------------------------

-- Reutiliza la función set_updated_at() que ya existe en el schema desde H1.
DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_updated_at' AND n.nspname = 'public'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $body$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $body$
    $func$;
  END IF;
END $outer$;

CREATE TRIGGER activities_updated_at
  BEFORE UPDATE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER activity_sessions_updated_at
  BEFORE UPDATE ON "activity_sessions"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER activity_enrollments_updated_at
  BEFORE UPDATE ON "activity_enrollments"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS — Row-Level Security (ENABLE + FORCE + política tenant_isolation)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "activities"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

ALTER TABLE "activity_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "activity_sessions"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

ALTER TABLE "activity_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_enrollments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "activity_enrollments"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 7. Grants para el rol de aplicación vetlla_app (no propietario, NOBYPASSRLS).
--    Idempotente: DO $$ protege contra el rol inexistente en deploy fresco.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "activities"           TO vetlla_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "activity_sessions"    TO vetlla_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "activity_enrollments" TO vetlla_app;
  END IF;
END $$;
