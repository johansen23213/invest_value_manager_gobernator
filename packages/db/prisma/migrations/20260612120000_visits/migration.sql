-- Visitas (VIS-001..VIS-010): configuración de franjas + registro de visitas.
--
-- Módulo FUERA de alcance (P2/bloqueado):
--   VIS-012: integración con control de accesos físico (IOT).
--   Cuestionario previo (COVID u otros).
--
-- Dos tablas:
--   visit_slot_configs: franjas horarias por centro (DIRECTOR vía centers:write).
--   visits: registro de cada visita (solicitud, confirmación, QR, check-in/out).
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (misma política que service_requests / comms).
--
-- Decisión de diseño — código QR:
--   Se almacena el código BASE32 de 8 chars EN CLARO (no en hash). Justificación:
--   - No es una credencial de cuenta: no da acceso a datos personales por sí solo.
--   - Es un identificador de sesión de visita con caducidad operativa: el endpoint
--     checkInByCode rechaza códigos cuya franja (scheduledAt) no sea HOY.
--   - La unicidad (tenant_id, qr_code) previene reutilización en el mismo tenant.
--   - Un código BASE32 de 8 chars tiene 32^8 ≈ 10^12 combinaciones; con caducidad
--     de un día el riesgo de fuerza bruta es despreciable en este contexto operativo.
--   Diferencia con auth_tokens: esos tokens son credenciales de cuenta de larga vida
--   que sí se hashean (SHA-256). El QR de visita no actúa como credencial.

-- ---------------------------------------------------------------------------
-- 1. Enum nuevo
-- ---------------------------------------------------------------------------

CREATE TYPE "VisitStatus" AS ENUM (
  'SOLICITADA',
  'CONFIRMADA',
  'RECHAZADA',
  'CANCELADA',
  'EN_CURSO',
  'COMPLETADA',
  'NO_SHOW'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla visit_slot_configs
-- ---------------------------------------------------------------------------

CREATE TABLE "visit_slot_configs" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"    TEXT         NOT NULL,
  "center_id"    TEXT         NOT NULL,
  "day_of_week"  INTEGER      NOT NULL,             -- 0=domingo … 6=sábado
  "start_time"   TEXT         NOT NULL,             -- "HH:MM" 24h
  "end_time"     TEXT         NOT NULL,             -- "HH:MM" 24h
  "capacity"     INTEGER      NOT NULL,             -- visitas simultáneas admitidas
  "auto_approve" BOOLEAN      NOT NULL DEFAULT TRUE, -- VIS-003
  "active"       BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visit_slot_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visit_slot_configs_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE
);

CREATE INDEX "visit_slot_configs_tenant_id_idx"         ON "visit_slot_configs"("tenant_id");
CREATE INDEX "visit_slot_configs_tenant_center_id_idx"  ON "visit_slot_configs"("tenant_id", "center_id");

-- ---------------------------------------------------------------------------
-- 3. Tabla visits
-- ---------------------------------------------------------------------------

CREATE TABLE "visits" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"        TEXT         NOT NULL,
  "resident_id"      TEXT         NOT NULL,
  "requested_by_id"  TEXT         NOT NULL,         -- user.id del familiar
  "scheduled_at"     TIMESTAMP(3) NOT NULL,          -- inicio de la franja (UTC)
  "duration_min"     INTEGER      NOT NULL DEFAULT 60,
  "visitor_names"    JSONB        NOT NULL,          -- string[] — acompañantes
  "status"           "VisitStatus" NOT NULL DEFAULT 'SOLICITADA',
  "qr_code"          TEXT,                          -- BASE32 8 chars, generado al confirmar
  "check_in_at"      TIMESTAMP(3),
  "check_out_at"     TIMESTAMP(3),
  "cancel_reason"    TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visits_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "visits_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id"),
  CONSTRAINT "visits_tenant_qr_code_unique"
    UNIQUE ("tenant_id", "qr_code")
);

CREATE INDEX "visits_tenant_id_idx"          ON "visits"("tenant_id");
CREATE INDEX "visits_tenant_resident_idx"    ON "visits"("tenant_id", "resident_id");
CREATE INDEX "visits_tenant_scheduled_idx"   ON "visits"("tenant_id", "scheduled_at");
CREATE INDEX "visits_tenant_status_idx"      ON "visits"("tenant_id", "status");

-- ---------------------------------------------------------------------------
-- 4. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "visit_slot_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_slot_configs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "visits"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visits"             FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "visit_slot_configs"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "visits"
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
      ON "visit_slot_configs", "visits"
      TO vetlla_app;
  END IF;
END $$;
