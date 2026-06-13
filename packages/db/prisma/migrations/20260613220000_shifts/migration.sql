-- Épica D del core asistencial (ADR-0016 core-suficiente):
--   CUADRANTES/TURNOS DEL PERSONAL + CIERRE DE TURNO FIRMADO
--   RF-PRO-003/004/008/009/010/013
--
-- Fuera de alcance (decisión CIO):
--   RF-PRO-005 (generación de tareas operativas desde el PIA) y
--   RF-PRO-012 (alerta de tareas PIA vencidas) → módulo de tareas propio, épica futura.
--
-- Decisiones de diseño:
--
--   StaffShift — se usa NursingNoteShift (enum ya existente) en lugar de crear
--   un enum duplicado. El tipo en BD ya existe: "NursingNoteShift" con valores
--   MANANA/TARDE/NOCHE. Las nuevas tablas shift_templates, shift_assignments y
--   shift_handovers referencian ese mismo tipo. Esto garantiza coherencia con el
--   resto del schema (lib/mar.ts, NursingNote) y evita proliferación de enums
--   semánticamente idénticos.
--
--   AssignmentStatus — enum nuevo PLANIFICADO/CONFIRMADO/AUSENTE/SUSTITUIDO
--   para el ciclo de vida de una asignación al cuadrante.
--
--   shift_templates — plantilla de turno por centro/unidad. Define el mínimo de
--   personal (minStaff) que es la base de la alerta de infra-cobertura (RF-PRO-004).
--   Sin residentId → no entra en dsar-registry.
--
--   shift_assignments — asignación del trabajador (userId) a un turno+día. Es dato
--   del TRABAJADOR, no del residente → no va en dsar-registry. Sí tiene tenantId
--   → RLS ENABLE+FORCE. @@unique([tenantId, userId, date, shift]) garantiza
--   idempotencia: no se pueden duplicar asignaciones.
--
--   shift_handovers — cierre de turno firmado (RF-PRO-008/009/010/013). Firma simple:
--   closedById (usuario autenticado) + closedAt (timestamp del servidor). La firma
--   avanzada eIDAS queda pendiente de Q-008. @@unique([tenantId, centerId, unitId,
--   date, shift]) asegura un único cierre por turno/unidad/día. Sin residentId →
--   no entra en dsar-registry.
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (misma plantilla que 20260613210000_nutrition).

-- ---------------------------------------------------------------------------
-- 1. Enum AssignmentStatus (nuevo)
-- ---------------------------------------------------------------------------

CREATE TYPE "AssignmentStatus" AS ENUM (
  'PLANIFICADO',
  'CONFIRMADO',
  'AUSENTE',
  'SUSTITUIDO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla shift_templates — plantilla de turno por centro/unidad (RF-PRO-003)
-- ---------------------------------------------------------------------------
-- Datos del CENTRO/ORGANIZACIÓN. Sin residentId → no entra en dsar-registry.
-- centerId FK → Center (Cascade): si se borra el centro, se borran sus plantillas.
-- unitId opcional: si NULL, la plantilla aplica a todo el centro.
-- minStaff: mínimo de personal por turno — base de la alerta de infra-cobertura.
-- Usa NursingNoteShift (existente) para coherencia con el resto del schema.

CREATE TABLE "shift_templates" (
  "id"             TEXT              NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"      TEXT              NOT NULL,
  "center_id"      TEXT              NOT NULL,
  "unit_id"        TEXT,
  "name"           TEXT              NOT NULL,
  "shift"          "NursingNoteShift" NOT NULL,
  -- Hora de inicio y fin en formato "HH:MM" (24h). Informativo; la franja
  -- definitiva la define NursingNoteShift (MANANA 06-14, TARDE 14-22, NOCHE 22-06).
  "start_time"     TEXT              NOT NULL,
  "end_time"       TEXT              NOT NULL,
  -- Mínimo de personal que debe cubrir este turno (base de la alerta RF-PRO-004).
  "min_staff"      INTEGER           NOT NULL DEFAULT 1,
  "active"         BOOLEAN           NOT NULL DEFAULT true,
  "created_by_id"  TEXT              NOT NULL,
  "created_at"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_templates_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_templates_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_templates_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE INDEX "shift_templates_tenant_id_idx"
  ON "shift_templates"("tenant_id");
CREATE INDEX "shift_templates_tenant_center_idx"
  ON "shift_templates"("tenant_id", "center_id");

-- ---------------------------------------------------------------------------
-- 3. Tabla shift_assignments — asignación de trabajador a un turno (RF-PRO-003)
-- ---------------------------------------------------------------------------
-- Dato del TRABAJADOR (userId), NO del residente. Sin residentId.
-- @@unique([tenantId, userId, date, shift]) previene duplicados de asignación.
-- substituteUserId: quien cubre en caso AUSENTE/SUSTITUIDO.

CREATE TABLE "shift_assignments" (
  "id"                   TEXT               NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"            TEXT               NOT NULL,
  "user_id"              TEXT               NOT NULL,
  "date"                 TIMESTAMP(3)       NOT NULL,
  "shift"                "NursingNoteShift" NOT NULL,
  "unit_id"              TEXT,
  "status"               "AssignmentStatus" NOT NULL DEFAULT 'PLANIFICADO',
  "substitute_user_id"   TEXT,
  "notes"                TEXT,
  "created_by_id"        TEXT               NOT NULL,
  "created_at"           TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_assignments_unique_assignment"
    UNIQUE ("tenant_id", "user_id", "date", "shift"),
  CONSTRAINT "shift_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_assignments_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL,
  CONSTRAINT "shift_assignments_substitute_user_id_fkey"
    FOREIGN KEY ("substitute_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "shift_assignments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE INDEX "shift_assignments_tenant_id_idx"
  ON "shift_assignments"("tenant_id");
CREATE INDEX "shift_assignments_tenant_date_idx"
  ON "shift_assignments"("tenant_id", "date");
CREATE INDEX "shift_assignments_tenant_user_idx"
  ON "shift_assignments"("tenant_id", "user_id");
CREATE INDEX "shift_assignments_tenant_unit_idx"
  ON "shift_assignments"("tenant_id", "unit_id");

-- ---------------------------------------------------------------------------
-- 4. Tabla shift_handovers — cierre de turno firmado (RF-PRO-008/009/010/013)
-- ---------------------------------------------------------------------------
-- Sin residentId → no entra en dsar-registry.
-- Firma simple (RF-PRO-013): closedById + closedAt = el par IS la firma.
-- La firma avanzada eIDAS queda pendiente de Q-008.
-- @@unique([tenantId, centerId, unitId, date, shift]) — un cierre por turno/unidad/día.
-- NOTA: unitId puede ser NULL (cierre a nivel de centro completo, sin unidad).
-- La unicidad considera NULL como valor único (NULLS NOT DISTINCT — Postgres 15+).
-- Para Postgres <15 usamos un índice parcial que cubre los casos NULL.

CREATE TABLE "shift_handovers" (
  "id"                  TEXT               NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"           TEXT               NOT NULL,
  "center_id"           TEXT               NOT NULL,
  "unit_id"             TEXT,
  "date"                TIMESTAMP(3)       NOT NULL,
  "shift"               "NursingNoteShift" NOT NULL,
  -- Observaciones generales del turno (resumen narrativo).
  "summary"             TEXT               NOT NULL,
  -- Incidencias relevantes durante el turno (opcional).
  "incidents_summary"   TEXT,
  -- Pendientes para el turno entrante (opcional).
  "pending_tasks"       TEXT,
  -- Firma simple: userId + timestamp del servidor.
  "closed_by_id"        TEXT               NOT NULL,
  "closed_at"           TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"          TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shift_handovers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_handovers_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE,
  CONSTRAINT "shift_handovers_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL,
  CONSTRAINT "shift_handovers_closed_by_id_fkey"
    FOREIGN KEY ("closed_by_id") REFERENCES "users"("id")
);

-- Índice único que cubre el caso con unitId NOT NULL
CREATE UNIQUE INDEX "shift_handovers_unique_with_unit"
  ON "shift_handovers"("tenant_id", "center_id", "unit_id", "date", "shift")
  WHERE "unit_id" IS NOT NULL;

-- Índice único que cubre el caso con unitId NULL (cierre a nivel de centro)
CREATE UNIQUE INDEX "shift_handovers_unique_without_unit"
  ON "shift_handovers"("tenant_id", "center_id", "date", "shift")
  WHERE "unit_id" IS NULL;

CREATE INDEX "shift_handovers_tenant_id_idx"
  ON "shift_handovers"("tenant_id");
CREATE INDEX "shift_handovers_tenant_center_date_idx"
  ON "shift_handovers"("tenant_id", "center_id", "date");

-- ---------------------------------------------------------------------------
-- 5. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "shift_templates"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_templates"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "shift_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_assignments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "shift_handovers"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_handovers"  FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "shift_templates"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "shift_assignments"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "shift_handovers"
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
      ON "shift_templates", "shift_assignments", "shift_handovers"
      TO vetlla_app;
  END IF;
END $$;
