-- Fase 1 — Expediente sociosanitario ampliado
-- Fuente: docs/producto/2026-06-11-expediente-completo-residente.md
--
-- Estrategia:
--   1. Nuevos enums (AssessmentType ampliado + enums de dominio nuevos).
--   2. Columnas nuevas en tablas existentes (retrocompatibles: nullable / con default).
--   3. Tablas nuevas con RLS+FORCE+política en la misma migración.
--
-- IMPORTANTE: la migración es no-destructiva. Las columnas nuevas son nullable
-- o tienen default, por lo que los datos existentes no se ven afectados.

-- ---------------------------------------------------------------------------
-- 1. Ampliar enum AssessmentType con las escalas geriátricas de Fase 1
-- ---------------------------------------------------------------------------

ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'PFEIFFER';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'MEC_LOBO';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'GDS_REISBERG';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'NORTON';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'BRADEN';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'MNA';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'PAINAD';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'DOWNTON';
ALTER TYPE "AssessmentType"
  ADD VALUE IF NOT EXISTS 'LAWTON_BRODY';

-- ---------------------------------------------------------------------------
-- 2. Nuevos enums de dominio
-- ---------------------------------------------------------------------------

CREATE TYPE "PlaceRegime" AS ENUM ('PRIVADA', 'CONCERTADA', 'PRESTACION_VINCULADA');
CREATE TYPE "DietType"    AS ENUM ('NORMAL', 'TRITURADA', 'PASTOSA', 'BLANDA', 'DIABETICA', 'HIPOSODICA', 'OTRA');
CREATE TYPE "LiquidTexture" AS ENUM ('LIBRE', 'NECTAR', 'MIEL', 'PUDING');
CREATE TYPE "DeviceType"  AS ENUM (
  'SONDA_VESICAL', 'SONDA_NASOGASTRICA', 'OXIGENO_DOMICILIARIO', 'CPAP',
  'MARCAPASOS', 'DESFIBRILADOR_IMPLANTABLE',
  'PROTESIS_CADERA', 'PROTESIS_RODILLA', 'PROTESIS_AUDITIVA', 'PROTESIS_DENTAL',
  'OTRO'
);
CREATE TYPE "UPPOrigin"     AS ENUM ('INGRESO', 'CENTRO');
CREATE TYPE "RestraintType" AS ENUM ('BARANDILLAS', 'CINTURON_SILLA', 'MUNEQUERAS', 'CHALECO', 'OTRO');
CREATE TYPE "ConsentType"   AS ENUM (
  'INGRESO', 'IMAGEN', 'PORTAL_FAMILIAS', 'DATOS_SANITARIOS_EXTERNOS', 'IA_ANONIMA'
);
CREATE TYPE "AllergyType"   AS ENUM ('MEDICAMENTOSA', 'ALIMENTARIA', 'AMBIENTAL', 'LATEX', 'OTRA');

-- ---------------------------------------------------------------------------
-- 3. Columnas nuevas en tabla residents (retrocompatibles)
-- ---------------------------------------------------------------------------

-- Bloque A — Identificación y administrativo
ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "internal_record_no"   TEXT,
  ADD COLUMN IF NOT EXISTS "cip"                  TEXT,
  ADD COLUMN IF NOT EXISTS "social_security_no"   TEXT,
  ADD COLUMN IF NOT EXISTS "insurer_name"         TEXT,
  ADD COLUMN IF NOT EXISTS "place_regime"         "PlaceRegime" NOT NULL DEFAULT 'PRIVADA',
  ADD COLUMN IF NOT EXISTS "discharge_date"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "discharge_reason"     TEXT,
  ADD COLUMN IF NOT EXISTS "origin_center"        TEXT,
  ADD COLUMN IF NOT EXISTS "national_id_expiry"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "judicial_capacity"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "legal_rep_name"       TEXT,
  ADD COLUMN IF NOT EXISTS "legal_rep_phone"      TEXT,
  ADD COLUMN IF NOT EXISTS "legal_rep_email"      TEXT,
  ADD COLUMN IF NOT EXISTS "advance_directives"   BOOLEAN,
  ADD COLUMN IF NOT EXISTS "advance_dir_location" TEXT,
  ADD COLUMN IF NOT EXISTS "preferred_language"   TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS "blood_group"          TEXT;

-- Consentimientos RGPD (resumen de estado actual)
ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "consent_image"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consent_family_portal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consent_admission"     TIMESTAMP(3);

-- Bloque E — Ficha de cuidados operativos a pie de cama
ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "diet_type"              "DietType",
  ADD COLUMN IF NOT EXISTS "liquid_texture"         "LiquidTexture",
  ADD COLUMN IF NOT EXISTS "nutrition_supplements"  TEXT,
  ADD COLUMN IF NOT EXISTS "continence_type"        TEXT,
  ADD COLUMN IF NOT EXISTS "absorbent_size"         TEXT,
  ADD COLUMN IF NOT EXISTS "wandering_risk"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fall_risk"              BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. Columnas nuevas en emergency_contacts (retrocompatibles)
-- ---------------------------------------------------------------------------

ALTER TABLE "emergency_contacts"
  ADD COLUMN IF NOT EXISTS "call_order"     INTEGER,
  ADD COLUMN IF NOT EXISTS "availability"   TEXT,
  ADD COLUMN IF NOT EXISTS "postal_address" TEXT;

-- ---------------------------------------------------------------------------
-- 5. Columna nueva en allergies (retrocompatible — nullable)
-- ---------------------------------------------------------------------------

ALTER TABLE "allergies"
  ADD COLUMN IF NOT EXISTS "allergy_type" "AllergyType";

-- ---------------------------------------------------------------------------
-- 6. Tablas nuevas
-- ---------------------------------------------------------------------------

-- 6.1 resident_devices
CREATE TABLE "resident_devices" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "type"        "DeviceType" NOT NULL,
    "description" TEXT,
    "since"       TIMESTAMP(3),
    "notes"       TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_devices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resident_devices_tenant_id_idx"   ON "resident_devices"("tenant_id");
CREATE INDEX "resident_devices_resident_id_idx" ON "resident_devices"("resident_id");

ALTER TABLE "resident_devices"
  ADD CONSTRAINT "resident_devices_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.2 vaccines
CREATE TABLE "vaccines" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "lot"         TEXT,
    "notes"       TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vaccines_tenant_id_idx"   ON "vaccines"("tenant_id");
CREATE INDEX "vaccines_resident_id_idx" ON "vaccines"("resident_id");

ALTER TABLE "vaccines"
  ADD CONSTRAINT "vaccines_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.3 weight_records
CREATE TABLE "weight_records" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "resident_id"    TEXT NOT NULL,
    "weight_kg"      DOUBLE PRECISION NOT NULL,
    "height_cm"      DOUBLE PRECISION,
    "bmi"            DOUBLE PRECISION,
    "recorded_at"    TIMESTAMP(3) NOT NULL,
    "recorded_by_id" TEXT,
    "notes"          TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weight_records_tenant_id_idx"   ON "weight_records"("tenant_id");
CREATE INDEX "weight_records_resident_id_idx" ON "weight_records"("resident_id");

ALTER TABLE "weight_records"
  ADD CONSTRAINT "weight_records_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.4 pressure_ulcers
CREATE TABLE "pressure_ulcers" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "resident_id"   TEXT NOT NULL,
    "location"      TEXT NOT NULL,
    "stage"         INTEGER NOT NULL,
    "onset_date"    TIMESTAMP(3) NOT NULL,
    "resolved_date" TIMESTAMP(3),
    "acquired"      "UPPOrigin" NOT NULL,
    "notes"         TEXT,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pressure_ulcers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pressure_ulcers_tenant_id_idx"   ON "pressure_ulcers"("tenant_id");
CREATE INDEX "pressure_ulcers_resident_id_idx" ON "pressure_ulcers"("resident_id");

ALTER TABLE "pressure_ulcers"
  ADD CONSTRAINT "pressure_ulcers_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.5 upp_curings
CREATE TABLE "upp_curings" (
    "id"                TEXT NOT NULL,
    "tenant_id"         TEXT NOT NULL,
    "pressure_ulcer_id" TEXT NOT NULL,
    "date"              TIMESTAMP(3) NOT NULL,
    "treatment"         TEXT NOT NULL,
    "evolution"         TEXT,
    "done_by_id"        TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upp_curings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "upp_curings_tenant_id_idx"         ON "upp_curings"("tenant_id");
CREATE INDEX "upp_curings_pressure_ulcer_id_idx" ON "upp_curings"("pressure_ulcer_id");

ALTER TABLE "upp_curings"
  ADD CONSTRAINT "upp_curings_pressure_ulcer_id_fkey"
  FOREIGN KEY ("pressure_ulcer_id") REFERENCES "pressure_ulcers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.6 fall_records
CREATE TABLE "fall_records" (
    "id"            TEXT NOT NULL,
    "tenant_id"     TEXT NOT NULL,
    "resident_id"   TEXT NOT NULL,
    "occurred_at"   TIMESTAMP(3) NOT NULL,
    "location"      TEXT,
    "circumstances" TEXT,
    "injuries"      TEXT,
    "witnessed"     BOOLEAN NOT NULL DEFAULT false,
    "measures"      TEXT,
    "reported_by_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fall_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fall_records_tenant_id_idx"   ON "fall_records"("tenant_id");
CREATE INDEX "fall_records_resident_id_idx" ON "fall_records"("resident_id");

ALTER TABLE "fall_records"
  ADD CONSTRAINT "fall_records_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.7 restraints (MUY REGULADO — Ley 41/2002)
CREATE TABLE "restraints" (
    "id"               TEXT NOT NULL,
    "tenant_id"        TEXT NOT NULL,
    "resident_id"      TEXT NOT NULL,
    "type"             "RestraintType" NOT NULL,
    "justification"    TEXT NOT NULL,
    "prescribed_by_id" TEXT,
    "prescribed_at"    TIMESTAMP(3) NOT NULL,
    "consent_obtained" BOOLEAN NOT NULL DEFAULT false,
    "consent_date"     TIMESTAMP(3),
    "consent_by"       TEXT,
    "active"           BOOLEAN NOT NULL DEFAULT true,
    "end_date"         TIMESTAMP(3),
    "end_reason"       TEXT,
    "reviewed_at"      TIMESTAMP(3),
    "notes"            TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restraints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restraints_tenant_id_idx"   ON "restraints"("tenant_id");
CREATE INDEX "restraints_resident_id_idx" ON "restraints"("resident_id");

ALTER TABLE "restraints"
  ADD CONSTRAINT "restraints_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.8 consent_records (art. 7 RGPD — historial de consentimientos)
CREATE TABLE "consent_records" (
    "id"          TEXT NOT NULL,
    "tenant_id"   TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "type"        "ConsentType" NOT NULL,
    "granted"     BOOLEAN NOT NULL,
    "granted_by"  TEXT,
    "date"        TIMESTAMP(3) NOT NULL,
    "notes"       TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_tenant_id_idx"   ON "consent_records"("tenant_id");
CREATE INDEX "consent_records_resident_id_idx" ON "consent_records"("resident_id");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6.9 life_stories (1:1 con resident; atención centrada en la persona, UNE 158101)
CREATE TABLE "life_stories" (
    "id"               TEXT NOT NULL,
    "tenant_id"        TEXT NOT NULL,
    "resident_id"      TEXT NOT NULL,
    "profession"       TEXT,
    "hobbies"          TEXT,
    "music"            TEXT,
    "important_people" TEXT,
    "religion"         TEXT,
    "preferences"      TEXT,
    "notes"            TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "life_stories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "life_stories_resident_id_key" ON "life_stories"("resident_id");
CREATE INDEX "life_stories_tenant_id_idx"          ON "life_stories"("tenant_id");

ALTER TABLE "life_stories"
  ADD CONSTRAINT "life_stories_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. RLS — ENABLE + FORCE + política por tenant_id para todas las tablas nuevas
--    Mismo patrón que el resto de tablas con tenant_id (GUC app.tenant_id + bypass).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'resident_devices',
    'vaccines',
    'weight_records',
    'pressure_ulcers',
    'upp_curings',
    'fall_records',
    'restraints',
    'consent_records',
    'life_stories'
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
