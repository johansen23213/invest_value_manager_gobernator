-- Admisión / Preadmisión / Forecast de ocupación
--
-- Crea los enums nuevos de admisión (AdmissionStatus, AdmissionOrigin)
-- y la tabla admission_requests con:
--   - tenantId, centerId, unitId, residentId (FK Resident — nullable, se
--     rellena al admitir)
--   - Datos personales del candidato (nombre, fecha nac., contacto)
--   - Máquina de estados (status con enum AdmissionStatus)
--   - RLS ENABLE + FORCE + política tenant_isolation por GUC app.tenant_id
--
-- Forecast de ocupación: no requiere tabla nueva. La proyección se calcula
-- desde plazas/camas + residents (admissionDate/dischargeDate) + el campo
-- expectedAdmissionDate de esta tabla. Ver lib/ocupacion-forecast.ts.
--
-- RGPD — candidato a ingreso:
--   Los datos personales del candidato (firstName, lastName, birthDate,
--   contactPhone, contactEmail) se tratan bajo base de interés legítimo
--   (art. 6.1.f RGPD) durante la gestión del proceso. Al pasar a ADMITTED
--   se crea el Resident y se vincula mediante residentId. La política de
--   retención de solicitudes rechazadas/retiradas se define en Q-003.

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "AdmissionStatus" AS ENUM (
  'LEAD',
  'WAITLIST',
  'EVALUATION',
  'OFFERED',
  'ADMITTED',
  'REJECTED',
  'WITHDRAWN'
);

CREATE TYPE "AdmissionOrigin" AS ENUM (
  'DERIVACION_HOSPITAL',
  'DERIVACION_SS',
  'INICIATIVA_PROPIA',
  'TRASLADO_OTRO_CENTRO',
  'OTRO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla admission_requests
-- ---------------------------------------------------------------------------

CREATE TABLE "admission_requests" (
  "id"                     TEXT              NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"              TEXT              NOT NULL,
  "center_id"              TEXT              NOT NULL,
  "unit_id"                TEXT,
  "first_name"             TEXT              NOT NULL,
  "last_name"              TEXT              NOT NULL,
  "birth_date"             TIMESTAMP(3),
  "dependency_grade"       "DependencyGrade" NOT NULL DEFAULT 'SIN_VALORAR',
  "place_regime"           "PlaceRegime"     NOT NULL DEFAULT 'PRIVADA',
  "origin"                 "AdmissionOrigin" NOT NULL DEFAULT 'INICIATIVA_PROPIA',
  "contact_phone"          TEXT,
  "contact_email"          TEXT,
  "contact_name"           TEXT,
  "status"                 "AdmissionStatus" NOT NULL DEFAULT 'LEAD',
  "priority"               INTEGER           NOT NULL DEFAULT 2,
  "requested_at"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_admission_date" TIMESTAMP(3),
  "outcome_reason"         TEXT,
  "notes"                  TEXT,
  "resident_id"            TEXT,
  "created_by_id"          TEXT,
  "created_at"             TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admission_requests_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "admission_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "admission_requests_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT,
  CONSTRAINT "admission_requests_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL,
  CONSTRAINT "admission_requests_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE SET NULL
);

CREATE INDEX "admission_requests_tenant_id_idx"
  ON "admission_requests"("tenant_id");
CREATE INDEX "admission_requests_tenant_center_idx"
  ON "admission_requests"("tenant_id", "center_id");
CREATE INDEX "admission_requests_tenant_status_idx"
  ON "admission_requests"("tenant_id", "status");
CREATE INDEX "admission_requests_tenant_expected_date_idx"
  ON "admission_requests"("tenant_id", "expected_admission_date");
CREATE INDEX "admission_requests_resident_id_idx"
  ON "admission_requests"("resident_id");

-- ---------------------------------------------------------------------------
-- 3. Trigger para updated_at automático (patrón del proyecto)
-- ---------------------------------------------------------------------------

-- Reutiliza la función set_updated_at() que ya existe en el schema desde H1.
-- Si por alguna razón no existiera, la creamos de forma idempotente.
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

CREATE TRIGGER admission_requests_updated_at
  BEFORE UPDATE ON "admission_requests"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "admission_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "admission_requests"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 5. Grants para el rol de aplicación vetlla_app (no propietario, NOBYPASSRLS).
--    Idempotente: DO $$ protege contra el rol inexistente en deploy fresco.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "admission_requests"
      TO vetlla_app;
  END IF;
END $$;
