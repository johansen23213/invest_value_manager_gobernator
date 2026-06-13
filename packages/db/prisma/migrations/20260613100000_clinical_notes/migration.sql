-- Notas de enfermería por turno y evolución médica (Épica A del core asistencial).
--
-- RF-ENF-001..011 — Notas de enfermería por turno (nursing_notes).
-- RF-CLI-001..006/009/011 — Evolutivos médicos (medical_notes).
-- RF-PRO-008/009 — Traspaso de turno (la nota de enfermería es su base).
--
-- CONFIDENCIALIDAD (RF-CLI-010): medical_notes es STAFF-ONLY.
-- NO se expone en el portal de familias ni en ningún endpoint del rol FAMILIAR.
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (mismo patrón que service_requests, comms, visits).

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "NursingNoteShift" AS ENUM (
  'MANANA',
  'TARDE',
  'NOCHE'
);

CREATE TYPE "NursingNoteCategory" AS ENUM (
  'GENERAL',
  'INCIDENCIA',
  'CURA',
  'CONDUCTA',
  'SUENO',
  'DOLOR',
  'ALIMENTACION'
);

CREATE TYPE "MedicalNoteType" AS ENUM (
  'EVOLUTIVO',
  'EXPLORACION',
  'DERIVACION',
  'VISITA'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla nursing_notes
-- ---------------------------------------------------------------------------

CREATE TABLE "nursing_notes" (
  "id"          TEXT                   NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT                   NOT NULL,
  "resident_id" TEXT                   NOT NULL,
  "author_id"   TEXT                   NOT NULL,
  "shift"       "NursingNoteShift"     NOT NULL,
  "note_date"   TIMESTAMP(3)           NOT NULL,
  "body"        TEXT                   NOT NULL,
  "category"    "NursingNoteCategory"  NOT NULL DEFAULT 'GENERAL',
  "created_at"  TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nursing_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nursing_notes_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "nursing_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE INDEX "nursing_notes_tenant_id_idx"          ON "nursing_notes"("tenant_id");
CREATE INDEX "nursing_notes_tenant_resident_idx"    ON "nursing_notes"("tenant_id", "resident_id");
CREATE INDEX "nursing_notes_tenant_note_date_idx"   ON "nursing_notes"("tenant_id", "note_date");

-- ---------------------------------------------------------------------------
-- 3. Tabla medical_notes
-- ---------------------------------------------------------------------------

CREATE TABLE "medical_notes" (
  "id"          TEXT               NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT               NOT NULL,
  "resident_id" TEXT               NOT NULL,
  "author_id"   TEXT               NOT NULL,
  "note_date"   TIMESTAMP(3)       NOT NULL,
  "type"        "MedicalNoteType"  NOT NULL,
  "reason"      TEXT,
  "body"        TEXT               NOT NULL,
  "plan"        TEXT,
  "created_at"  TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "medical_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "medical_notes_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "medical_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE INDEX "medical_notes_tenant_id_idx"          ON "medical_notes"("tenant_id");
CREATE INDEX "medical_notes_tenant_resident_idx"    ON "medical_notes"("tenant_id", "resident_id");
CREATE INDEX "medical_notes_tenant_note_date_idx"   ON "medical_notes"("tenant_id", "note_date");

-- ---------------------------------------------------------------------------
-- 4. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "nursing_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nursing_notes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "medical_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medical_notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "nursing_notes"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "medical_notes"
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
      ON "nursing_notes", "medical_notes"
      TO vetlla_app;
  END IF;
END $$;
