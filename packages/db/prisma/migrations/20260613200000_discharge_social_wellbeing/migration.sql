-- Épica B del core asistencial (ADR-0016 core-suficiente):
--   (1) Gestión de exitus/baja con protocolo (RF-ADM-011/012/013)
--   (2) Informe social estructurado (RF-SOC-001..008)
--   (3) Perfil de bienestar ACP / UNE 158101 — 8 dimensiones (RF-SOC-003..006)
--
-- Decisiones de diseño:
--   discharge_records — permite múltiples registros por residente (histórico de
--   reingresos). No @unique en residentId: un residente puede darse de baja y
--   reingresar. La transacción del router actualiza Resident.status + libera cama.
--
--   social_reports — documento vivo (update autorizado). Staff-only; el FAMILIAR
--   no tiene residents:read en modo staff y nunca verá estos datos.
--
--   wellbeing_profiles — 1 perfil por residente (@unique). Upsert.
--   Las 8 dimensiones de bienestar de la ACP (UNE 158101): emocional, físico,
--   material, desarrollo personal, autodeterminación, relaciones interpersonales,
--   inclusión social, derechos.
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (misma plantilla que 20260613100000_clinical_notes).

-- ---------------------------------------------------------------------------
-- 1. Enum DischargeType
-- ---------------------------------------------------------------------------

CREATE TYPE "DischargeType" AS ENUM (
  'DEFUNCION',
  'VOLUNTARIA',
  'TRASLADO_CENTRO',
  'TRASLADO_HOSPITAL',
  'FIN_ESTANCIA',
  'OTRO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla discharge_records (RF-ADM-011/012/013)
-- ---------------------------------------------------------------------------

CREATE TABLE "discharge_records" (
  "id"                  TEXT            NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"           TEXT            NOT NULL,
  "resident_id"         TEXT            NOT NULL,
  "type"                "DischargeType" NOT NULL,
  "discharged_at"       TIMESTAMP(3)    NOT NULL,
  "reason"              TEXT,
  -- Para DEFUNCION: nombre del médico certificante (no la causa clínica).
  -- La causa de muerte NO se guarda en el summary del AuditLog (dato sensible).
  "certified_by"        TEXT,
  -- Centro o hospital de destino (para traslados).
  "destination"         TEXT,
  "family_notified_at"  TIMESTAMP(3),
  "belongings_returned" BOOLEAN         NOT NULL DEFAULT false,
  -- Checklist extendida en JSON (campos opcionales según protocolo del centro).
  -- Decisión: se usa checklist JSON en lugar de columnas boolean adicionales
  -- para evitar proliferación de columnas y permitir que cada centro defina
  -- su propio protocolo sin una migración nueva. Los campos core (familyNotifiedAt,
  -- belongingsReturned) son columnas tipadas para consultas estructuradas.
  "checklist"           JSONB,
  "notes"               TEXT,
  "recorded_by_id"      TEXT            NOT NULL,
  "created_at"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "discharge_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discharge_records_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "discharge_records_recorded_by_id_fkey"
    FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
);

CREATE INDEX "discharge_records_tenant_id_idx"
  ON "discharge_records"("tenant_id");
CREATE INDEX "discharge_records_tenant_resident_idx"
  ON "discharge_records"("tenant_id", "resident_id");
CREATE INDEX "discharge_records_tenant_discharged_at_idx"
  ON "discharge_records"("tenant_id", "discharged_at");

-- ---------------------------------------------------------------------------
-- 3. Tabla social_reports (RF-SOC-001..008)
-- ---------------------------------------------------------------------------
-- Staff-only. NO exponer en el portal de familias.
-- Permite update (documento vivo): el trabajador social lo actualiza periódicamente.

CREATE TABLE "social_reports" (
  "id"                 TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"          TEXT         NOT NULL,
  "resident_id"        TEXT         NOT NULL,
  "author_id"          TEXT         NOT NULL,
  "report_date"        TIMESTAMP(3) NOT NULL,
  -- RF-SOC-001: situación familiar
  "family_situation"   TEXT,
  -- RF-SOC-002: red de apoyo social
  "support_network"    TEXT,
  -- RF-SOC-003: situación económica
  "economic_situation" TEXT,
  -- RF-SOC-004: prestaciones y subsidios
  "benefits"           TEXT,
  -- RF-SOC-005: historial laboral
  "work_history"       TEXT,
  -- RF-SOC-006: valoración social global
  "social_assessment"  TEXT,
  -- RF-SOC-007: acuerdos con residente/familia
  "agreements"         TEXT,
  -- RF-SOC-008: fecha de próxima revisión (alerta periódica)
  "next_review_date"   TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "social_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_reports_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "social_reports_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE INDEX "social_reports_tenant_id_idx"
  ON "social_reports"("tenant_id");
CREATE INDEX "social_reports_tenant_resident_idx"
  ON "social_reports"("tenant_id", "resident_id");

-- ---------------------------------------------------------------------------
-- 4. Tabla wellbeing_profiles (RF-SOC-003..006, UNE 158101)
-- ---------------------------------------------------------------------------
-- 1 perfil por residente (UNIQUE en resident_id). Upsert.
-- 8 dimensiones de bienestar de la Atención Centrada en la Persona (ACP):
--   1. Bienestar emocional
--   2. Bienestar físico
--   3. Bienestar material
--   4. Desarrollo personal
--   5. Autodeterminación
--   6. Relaciones interpersonales
--   7. Inclusión social
--   8. Derechos

CREATE TABLE "wellbeing_profiles" (
  "id"                       TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"                TEXT         NOT NULL,
  "resident_id"              TEXT         NOT NULL,
  -- 8 dimensiones ACP (UNE 158101)
  "emotional_wellbeing"      TEXT,
  "physical_wellbeing"       TEXT,
  "material_wellbeing"       TEXT,
  "personal_development"     TEXT,
  "self_determination"       TEXT,
  "interpersonal_relations"  TEXT,
  "social_inclusion"         TEXT,
  "rights"                   TEXT,
  -- RF-SOC-005: lo que es importante PARA la persona (sus deseos)
  "important_to_the_person"  TEXT,
  -- RF-SOC-005: lo que es importante PARA su bienestar (necesidades, lo que debe evitarse)
  "important_for_the_person" TEXT,
  -- RF-SOC-007: revisión periódica con alerta de vencimiento
  "next_review_date"         TIMESTAMP(3),
  "updated_by_id"            TEXT,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wellbeing_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wellbeing_profiles_resident_id_key" UNIQUE ("resident_id"),
  CONSTRAINT "wellbeing_profiles_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "wellbeing_profiles_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "wellbeing_profiles_tenant_id_idx"
  ON "wellbeing_profiles"("tenant_id");
-- Índice para el panel de revisiones vencidas (listOverdueReviews)
CREATE INDEX "wellbeing_profiles_tenant_next_review_idx"
  ON "wellbeing_profiles"("tenant_id", "next_review_date");

-- ---------------------------------------------------------------------------
-- 5. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "discharge_records"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discharge_records"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "social_reports"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_reports"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "wellbeing_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wellbeing_profiles" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "discharge_records"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "social_reports"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "wellbeing_profiles"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 6. Grants para el rol de aplicación vetlla_app (idempotente).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "discharge_records", "social_reports", "wellbeing_profiles"
      TO vetlla_app;
  END IF;
END $$;
