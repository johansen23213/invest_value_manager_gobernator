-- Portal de familias — Solicitudes e incidencias (REQ-001..REQ-011)
--
-- Crea los tres enums nuevos (ServiceRequestCategory, ServiceRequestStatus,
-- ServiceRequestPriority), las dos tablas (service_requests,
-- service_request_comments), y aplica RLS ENABLE + FORCE + política por
-- tenant_id idéntica al patrón RLS del proyecto (GUC app.tenant_id + bypass).
--
-- NOTA Q-004: los adjuntos de fichero quedan bloqueados hasta Q-004.
-- Los comentarios de texto (service_request_comments) cubren la evidencia
-- textual por ahora.

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "ServiceRequestCategory" AS ENUM (
  'ADMINISTRACION',
  'DOCUMENTACION',
  'VISITAS',
  'ACTIVIDADES',
  'MANTENIMIENTO',
  'ALIMENTACION',
  'COMUNICACION',
  'OBJETOS_PERSONALES',
  'INCIDENCIA_APP',
  'OTRA'
);

CREATE TYPE "ServiceRequestStatus" AS ENUM (
  'RECIBIDA',
  'ASIGNADA',
  'EN_CURSO',
  'PENDIENTE_INFO',
  'RESUELTA',
  'CERRADA',
  'REABIERTA'
);

CREATE TYPE "ServiceRequestPriority" AS ENUM (
  'BAJA',
  'NORMAL',
  'ALTA',
  'URGENTE'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla service_requests
-- ---------------------------------------------------------------------------

CREATE TABLE "service_requests" (
  "id"                  TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"           TEXT        NOT NULL,
  "resident_id"         TEXT        NOT NULL,
  "created_by_id"       TEXT        NOT NULL,
  "assigned_to_id"      TEXT,
  "category"            "ServiceRequestCategory" NOT NULL,
  "status"              "ServiceRequestStatus"   NOT NULL DEFAULT 'RECIBIDA',
  "priority"            "ServiceRequestPriority" NOT NULL DEFAULT 'NORMAL',
  "title"               TEXT        NOT NULL,
  "description"         TEXT        NOT NULL,
  "sla_due_at"          TIMESTAMP(3),
  "first_response_at"   TIMESTAMP(3),
  "resolved_at"         TIMESTAMP(3),
  "closed_at"           TIMESTAMP(3),
  "satisfaction_score"  INTEGER,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_requests_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "service_requests_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id"),
  CONSTRAINT "service_requests_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "service_requests_satisfaction_score_check"
    CHECK ("satisfaction_score" IS NULL OR ("satisfaction_score" >= 1 AND "satisfaction_score" <= 5))
);

CREATE INDEX "service_requests_tenant_id_idx"      ON "service_requests"("tenant_id");
CREATE INDEX "service_requests_resident_id_idx"    ON "service_requests"("resident_id");
CREATE INDEX "service_requests_created_by_id_idx"  ON "service_requests"("created_by_id");
CREATE INDEX "service_requests_status_idx"         ON "service_requests"("status");

-- ---------------------------------------------------------------------------
-- 3. Tabla service_request_comments
-- ---------------------------------------------------------------------------

CREATE TABLE "service_request_comments" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT        NOT NULL,
  "request_id"  TEXT        NOT NULL,
  "author_id"   TEXT        NOT NULL,
  "body"        TEXT        NOT NULL,
  "internal"    BOOLEAN     NOT NULL DEFAULT FALSE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_request_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_request_comments_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE,
  CONSTRAINT "service_request_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
);

CREATE INDEX "service_request_comments_tenant_id_idx"   ON "service_request_comments"("tenant_id");
CREATE INDEX "service_request_comments_request_id_idx"  ON "service_request_comments"("request_id");

-- ---------------------------------------------------------------------------
-- 4. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "service_requests"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_requests"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "service_request_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_request_comments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "service_requests"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "service_request_comments"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );
