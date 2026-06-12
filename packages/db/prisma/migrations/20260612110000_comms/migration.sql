-- Comunicaciones: comunicados del centro + mensajería bidireccional (COM-001..COM-011).
--
-- Pieza 1 — COMUNICADOS:
--   Announcement: un comunicado segmentado (TODO_EL_CENTRO, POR_UNIDAD, RESIDENTE).
--   AnnouncementReceipt: lectura y acuse de recibo por usuario.
--
-- Pieza 2 — MENSAJERÍA:
--   MessageThread: hilo de mensajería vinculado a un residente.
--   Message: mensaje dentro del hilo.
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id idéntica al patrón
-- del proyecto (mismo patrón que service_requests / family_links).
--
-- NOTA Q-004: adjuntos de fichero en mensajes quedan fuera de alcance hasta
-- que se resuelva el object storage (Q-004).

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "AnnouncementAudience" AS ENUM (
  'TODO_EL_CENTRO',
  'POR_UNIDAD',
  'RESIDENTE'
);

CREATE TYPE "AnnouncementCategory" AS ENUM (
  'ADMINISTRACION',
  'VISITAS',
  'BIENESTAR',
  'DOCUMENTACION',
  'EVENTOS',
  'GENERAL'
);

CREATE TYPE "MessageThreadCategory" AS ENUM (
  'ADMINISTRACION',
  'VISITAS',
  'BIENESTAR',
  'DOCUMENTACION',
  'PAGOS',
  'GENERAL'
);

CREATE TYPE "MessageThreadStatus" AS ENUM (
  'ABIERTO',
  'CERRADO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla announcements
-- ---------------------------------------------------------------------------

CREATE TABLE "announcements" (
  "id"            TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"     TEXT         NOT NULL,
  "author_id"     TEXT         NOT NULL,
  "title"         TEXT         NOT NULL,
  "body"          TEXT         NOT NULL,
  "category"      "AnnouncementCategory" NOT NULL DEFAULT 'GENERAL',
  "audience"      "AnnouncementAudience" NOT NULL DEFAULT 'TODO_EL_CENTRO',
  "unit_id"       TEXT,
  "resident_id"   TEXT,
  "requires_ack"  BOOLEAN      NOT NULL DEFAULT FALSE,
  "published_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id"),
  CONSTRAINT "announcements_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL,
  CONSTRAINT "announcements_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE
);

CREATE INDEX "announcements_tenant_id_idx"   ON "announcements"("tenant_id");
CREATE INDEX "announcements_author_id_idx"   ON "announcements"("author_id");
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at");

-- ---------------------------------------------------------------------------
-- 3. Tabla announcement_receipts
-- ---------------------------------------------------------------------------

CREATE TABLE "announcement_receipts" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"        TEXT         NOT NULL,
  "announcement_id"  TEXT         NOT NULL,
  "user_id"          TEXT         NOT NULL,
  "read_at"          TIMESTAMP(3),
  "acknowledged_at"  TIMESTAMP(3),

  CONSTRAINT "announcement_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcement_receipts_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE,
  CONSTRAINT "announcement_receipts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "announcement_receipts_announcement_user_uniq"
    UNIQUE ("announcement_id", "user_id")
);

CREATE INDEX "announcement_receipts_tenant_id_idx"       ON "announcement_receipts"("tenant_id");
CREATE INDEX "announcement_receipts_announcement_id_idx" ON "announcement_receipts"("announcement_id");
CREATE INDEX "announcement_receipts_user_id_idx"         ON "announcement_receipts"("user_id");

-- ---------------------------------------------------------------------------
-- 4. Tabla message_threads
-- ---------------------------------------------------------------------------

CREATE TABLE "message_threads" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"        TEXT         NOT NULL,
  "resident_id"      TEXT         NOT NULL,
  "subject"          TEXT         NOT NULL,
  "category"         "MessageThreadCategory" NOT NULL DEFAULT 'GENERAL',
  "status"           "MessageThreadStatus"   NOT NULL DEFAULT 'ABIERTO',
  "created_by_id"    TEXT         NOT NULL,
  "last_message_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_threads_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "message_threads_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE INDEX "message_threads_tenant_id_idx"    ON "message_threads"("tenant_id");
CREATE INDEX "message_threads_resident_id_idx"  ON "message_threads"("resident_id");
CREATE INDEX "message_threads_last_message_idx" ON "message_threads"("last_message_at");

-- ---------------------------------------------------------------------------
-- 5. Tabla messages
-- ---------------------------------------------------------------------------

CREATE TABLE "messages" (
  "id"                 TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"          TEXT         NOT NULL,
  "thread_id"          TEXT         NOT NULL,
  "author_id"          TEXT         NOT NULL,
  "body"               TEXT         NOT NULL,
  "read_by_staff_at"   TIMESTAMP(3),
  "read_by_family_at"  TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE,
  CONSTRAINT "messages_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE INDEX "messages_tenant_id_idx"  ON "messages"("tenant_id");
CREATE INDEX "messages_thread_id_idx"  ON "messages"("thread_id");

-- ---------------------------------------------------------------------------
-- 6. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "announcements"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "announcement_receipts"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcement_receipts"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "message_threads"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_threads"        FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages"               FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "announcements"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "announcement_receipts"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "message_threads"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "messages"
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
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON "announcements", "announcement_receipts", "message_threads", "messages"
      TO vetlla_app;
  END IF;
END $$;
