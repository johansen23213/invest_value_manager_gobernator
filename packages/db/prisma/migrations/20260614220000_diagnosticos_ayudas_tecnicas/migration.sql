-- Diagnósticos con estado + Ayudas técnicas (productos de apoyo)
--
-- Tablas afectadas:
--   diagnoses       — extensión no destructiva del modelo existente:
--                     se añaden columnas nullable/con default (type, status,
--                     resolved_at, prescribed_by_id, notes) sin tocar los
--                     datos existentes. Los registros previos heredan los defaults.
--   assistive_devices — tabla nueva para ayudas técnicas del residente.
--
-- Ambas tablas llevan:
--   - tenant_id NOT NULL
--   - ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY
--   - Política tenant_isolation por GUC app.tenant_id (mismo patrón que el resto)
--
-- DSAR:
--   diagnoses:        ya declarado en dsar-registry.ts; la entry existente cubre
--                     los campos nuevos (export:true, anonymize:'delete').
--   assistive_devices: tiene residentId → declarado en dsar-registry.ts.
--
-- CONVIVENCIA CON DATOS PREVIOS:
--   El modelo Diagnosis ya existía con (code?, description, diagnosedAt?).
--   Los campos nuevos son todos nullable o llevan DEFAULT: migración no destructiva.
--   type    DEFAULT 'PRINCIPAL', status DEFAULT 'ACTIVO' → todos los registros
--   previos quedan tipados como diagnóstico principal activo.

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "DiagnosisType" AS ENUM ('PRINCIPAL', 'SECUNDARIO');

CREATE TYPE "DiagnosisStatus" AS ENUM ('ACTIVO', 'CRONICO', 'RESUELTO');

CREATE TYPE "AssistiveDeviceType" AS ENUM (
  'SILLA_RUEDAS',
  'ANDADOR',
  'GRUA',
  'CAMA_ARTICULADA',
  'AUDIFONO',
  'OXIGENO',
  'MULETAS',
  'ORTESIS',
  'SILLA_DUCHA',
  'COLCHON_ANTIESCARAS',
  'OTRO'
);

CREATE TYPE "AssistiveDeviceStatus" AS ENUM ('ACTIVO', 'RETIRADO');

-- ---------------------------------------------------------------------------
-- 2. Extensión no destructiva de la tabla diagnoses (campos nuevos)
-- ---------------------------------------------------------------------------

ALTER TABLE "diagnoses"
  ADD COLUMN IF NOT EXISTS "type"             "DiagnosisType"   NOT NULL DEFAULT 'PRINCIPAL',
  ADD COLUMN IF NOT EXISTS "status"           "DiagnosisStatus" NOT NULL DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS "resolved_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "prescribed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "notes"            TEXT;

-- Índice de eficiencia para consultas por estado (diagnósticos activos vs resueltos)
CREATE INDEX IF NOT EXISTS "diagnoses_tenant_id_status_idx"
  ON "diagnoses"("tenant_id", "status");

-- ---------------------------------------------------------------------------
-- 3. Tabla assistive_devices (ayudas técnicas / productos de apoyo)
-- ---------------------------------------------------------------------------

CREATE TABLE "assistive_devices" (
  "id"               TEXT                    NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"        TEXT                    NOT NULL,
  "resident_id"      TEXT                    NOT NULL,
  "type"             "AssistiveDeviceType"   NOT NULL,
  "description"      TEXT,
  "status"           "AssistiveDeviceStatus" NOT NULL DEFAULT 'ACTIVO',
  "prescribed_at"    TIMESTAMP(3)            NOT NULL,
  "retired_at"       TIMESTAMP(3),
  "prescribed_by_id" TEXT,
  "owned_by_center"  BOOLEAN                 NOT NULL DEFAULT FALSE,
  "notes"            TEXT,
  "created_at"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "assistive_devices_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "assistive_devices_resident_id_fkey"
    FOREIGN KEY ("resident_id")
    REFERENCES "residents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "assistive_devices_tenant_id_idx"
  ON "assistive_devices"("tenant_id");

CREATE INDEX "assistive_devices_resident_id_idx"
  ON "assistive_devices"("resident_id");

CREATE INDEX "assistive_devices_tenant_id_status_idx"
  ON "assistive_devices"("tenant_id", "status");

-- ---------------------------------------------------------------------------
-- 4. Trigger updated_at para assistive_devices
-- ---------------------------------------------------------------------------

DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
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

CREATE TRIGGER assistive_devices_updated_at
  BEFORE UPDATE ON "assistive_devices"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS — Row-Level Security (ENABLE + FORCE + política tenant_isolation)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
--
--    NOTA: diagnoses ya tiene RLS desde la migración inicial del expediente.
--    Solo necesita la nueva tabla assistive_devices.
-- ---------------------------------------------------------------------------

ALTER TABLE "assistive_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistive_devices" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "assistive_devices"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 6. Grants para el rol de aplicación vetlla_app (no propietario, NOBYPASSRLS).
--    Idempotente: DO $$ protege contra el rol inexistente en deploy fresco.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "assistive_devices" TO vetlla_app;
  END IF;
END $$;
