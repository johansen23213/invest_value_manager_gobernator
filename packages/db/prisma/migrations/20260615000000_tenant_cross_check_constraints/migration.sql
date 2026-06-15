-- DAT-A02 — Defensa en profundidad: cross-tenant check en tablas hijas
--
-- ⚠️ CONSTRAINTS SOLO A NIVEL DE BD — NO MODELADOS EN schema.prisma (intencional).
-- Estas FKs compuestas (tenant_id, parent_id) NO se declaran como relaciones en
-- el schema de Prisma porque hacerlo convertiría `tenant_id` en un campo gestionado
-- por la relación, rompiendo toda escritura que setea tenant_id explícito en las
-- hijas (routers + tests fallan con "Unknown argument tenantId"). La enforcement
-- vive aquí (Postgres) y es inmune a RLS (un FK check ve todas las filas). Si en el
-- futuro alguien corre `prisma migrate dev`, Prisma intentará BORRAR estos índices y
-- FKs por "drift": NO aceptar ese borrado — son defensa de aislamiento multitenant.
--
-- Problema: las tablas hijas tienen tenant_id propio y RLS, pero la FK al padre
-- solo referencia el id del padre (simple). Un INSERT malintencionado o con bug
-- podría poner una fila hija de tenant A apuntando a un padre de tenant B.
-- La RLS de la hija solo valida SU tenant_id, no el del padre.
--
-- Solución: FKs compuestas (tenant_id, parent_id) que fuerzan que
-- hijo.tenant_id = padre.tenant_id a nivel de BD, independientemente de la
-- aplicación y sin depender exclusivamente de RLS.
--
-- Patrón por tabla:
--   1. Añadir UNIQUE (tenant_id, id) en la tabla padre (necesario para FK compuesta).
--   2. Reemplazar la FK simple del hijo por FK compuesta (tenant_id, parent_id).
--
-- No-destructivo: ADD CONSTRAINT / DROP CONSTRAINT no borran datos.
-- Los nuevos UNIQUEs son consistentes con los datos existentes (tenant_id + PK son
-- únicos por definición si la lógica de aplicación es correcta).
--
-- Pares cubiertos (según auditoría DAT-A02 / ALTO-03 en 06-modelo-datos-rls.md):
--   1. upp_curings           → pressure_ulcers
--   2. sync_conflicts        → care_records
--   3. medication_sync_conflicts → medication_administrations
--   4. care_plan_goals       → care_plans
--   5. care_plan_reviews     → care_plans
--   6. invoice_lines         → invoices
--   7. activity_enrollments  → activity_sessions
--
-- Verificación sin BD: los datos de seed crean padre e hijo con el mismo tenant_id
-- (generado por cuid() en el mismo tenant context), por lo que los constraints no
-- rompen el seed existente.

-- ===========================================================================
-- 1. pressure_ulcers → upp_curings
-- ===========================================================================

-- 1a. Índice UNIQUE compuesto en el padre (necesario para FK compuesta referenciando
--     (tenant_id, id) en lugar de solo id).
CREATE UNIQUE INDEX "pressure_ulcers_tenant_id_id_key"
  ON "pressure_ulcers"("tenant_id", "id");

-- 1b. Añadir columna tenant_id en upp_curings si no coincide con un valor preexistente
--     (ya existe desde la migración original; no se añade de nuevo).
--     Eliminar la FK simple y crear la FK compuesta.
ALTER TABLE "upp_curings"
  DROP CONSTRAINT IF EXISTS "upp_curings_pressure_ulcer_id_fkey";

ALTER TABLE "upp_curings"
  ADD CONSTRAINT "upp_curings_tenant_pressure_ulcer_fkey"
    FOREIGN KEY ("tenant_id", "pressure_ulcer_id")
    REFERENCES "pressure_ulcers"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "upp_curings_tenant_pressure_ulcer_fkey" ON "upp_curings"
  IS 'DAT-A02: garantiza upp_curings.tenant_id = pressure_ulcers.tenant_id (cross-tenant check)';

-- ===========================================================================
-- 2. care_records → sync_conflicts
-- ===========================================================================

CREATE UNIQUE INDEX "care_records_tenant_id_id_key"
  ON "care_records"("tenant_id", "id");

ALTER TABLE "sync_conflicts"
  DROP CONSTRAINT IF EXISTS "sync_conflicts_care_record_id_fkey";

ALTER TABLE "sync_conflicts"
  ADD CONSTRAINT "sync_conflicts_tenant_care_record_fkey"
    FOREIGN KEY ("tenant_id", "care_record_id")
    REFERENCES "care_records"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "sync_conflicts_tenant_care_record_fkey" ON "sync_conflicts"
  IS 'DAT-A02: garantiza sync_conflicts.tenant_id = care_records.tenant_id (cross-tenant check)';

-- ===========================================================================
-- 3. medication_administrations → medication_sync_conflicts
-- ===========================================================================

CREATE UNIQUE INDEX "medication_administrations_tenant_id_id_key"
  ON "medication_administrations"("tenant_id", "id");

ALTER TABLE "medication_sync_conflicts"
  DROP CONSTRAINT IF EXISTS "medication_sync_conflicts_administration_id_fkey";

ALTER TABLE "medication_sync_conflicts"
  ADD CONSTRAINT "medication_sync_conflicts_tenant_administration_fkey"
    FOREIGN KEY ("tenant_id", "administration_id")
    REFERENCES "medication_administrations"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "medication_sync_conflicts_tenant_administration_fkey" ON "medication_sync_conflicts"
  IS 'DAT-A02: garantiza medication_sync_conflicts.tenant_id = medication_administrations.tenant_id';

-- ===========================================================================
-- 4 & 5. care_plans → care_plan_goals + care_plan_reviews
-- ===========================================================================

CREATE UNIQUE INDEX "care_plans_tenant_id_id_key"
  ON "care_plans"("tenant_id", "id");

-- 4. care_plan_goals
ALTER TABLE "care_plan_goals"
  DROP CONSTRAINT IF EXISTS "care_plan_goals_care_plan_id_fkey";

ALTER TABLE "care_plan_goals"
  ADD CONSTRAINT "care_plan_goals_tenant_care_plan_fkey"
    FOREIGN KEY ("tenant_id", "care_plan_id")
    REFERENCES "care_plans"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "care_plan_goals_tenant_care_plan_fkey" ON "care_plan_goals"
  IS 'DAT-A02: garantiza care_plan_goals.tenant_id = care_plans.tenant_id (cross-tenant check)';

-- 5. care_plan_reviews
ALTER TABLE "care_plan_reviews"
  DROP CONSTRAINT IF EXISTS "care_plan_reviews_care_plan_id_fkey";

ALTER TABLE "care_plan_reviews"
  ADD CONSTRAINT "care_plan_reviews_tenant_care_plan_fkey"
    FOREIGN KEY ("tenant_id", "care_plan_id")
    REFERENCES "care_plans"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "care_plan_reviews_tenant_care_plan_fkey" ON "care_plan_reviews"
  IS 'DAT-A02: garantiza care_plan_reviews.tenant_id = care_plans.tenant_id (cross-tenant check)';

-- ===========================================================================
-- 6. invoices → invoice_lines
-- ===========================================================================

CREATE UNIQUE INDEX "invoices_tenant_id_id_key"
  ON "invoices"("tenant_id", "id");

ALTER TABLE "invoice_lines"
  DROP CONSTRAINT IF EXISTS "invoice_lines_invoice_id_fkey";

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_tenant_invoice_fkey"
    FOREIGN KEY ("tenant_id", "invoice_id")
    REFERENCES "invoices"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "invoice_lines_tenant_invoice_fkey" ON "invoice_lines"
  IS 'DAT-A02: garantiza invoice_lines.tenant_id = invoices.tenant_id (cross-tenant check)';

-- ===========================================================================
-- 7. activity_sessions → activity_enrollments
-- ===========================================================================

CREATE UNIQUE INDEX "activity_sessions_tenant_id_id_key"
  ON "activity_sessions"("tenant_id", "id");

ALTER TABLE "activity_enrollments"
  DROP CONSTRAINT IF EXISTS "activity_enrollments_session_id_fkey";

ALTER TABLE "activity_enrollments"
  ADD CONSTRAINT "activity_enrollments_tenant_session_fkey"
    FOREIGN KEY ("tenant_id", "session_id")
    REFERENCES "activity_sessions"("tenant_id", "id")
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT "activity_enrollments_tenant_session_fkey" ON "activity_enrollments"
  IS 'DAT-A02: garantiza activity_enrollments.tenant_id = activity_sessions.tenant_id (cross-tenant check)';
