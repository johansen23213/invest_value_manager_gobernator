-- Épica C del core asistencial (ADR-0016 core-suficiente):
--   NUTRICIÓN, MENÚS Y COMEDOR (RF-NUT-001..009)
--
-- Decisiones de diseño:
--
--   MealType — enum nuevo con las 4 franjas del día (desayuno, comida,
--   merienda, cena). No existe ningún equivalente en el schema: CareRecordType
--   tiene INGESTA como categoría genérica offline-first; este enum es distinto
--   y específico de la nueva tabla estructurada.
--
--   Allergen — enum con los 14 alérgenos de declaración obligatoria (Reglamento
--   UE 1169/2011). No existe en el schema: AllergyType es categoría de alergia
--   del residente (ALIMENTARIA, MEDICAMENTOSA…), no los alérgenos del menú.
--
--   menu_items — datos del CENTRO, no del residente. Sin residentId → no entra
--   en dsar-registry. Sí tiene tenantId → RLS ENABLE+FORCE+policy obligatorio.
--
--   intake_records — datos del RESIDENTE. Tiene residentId → entra en
--   dsar-registry (export:true, anonymize:'delete'). El campo foodPct es
--   restringido a 0-100 por CHECK constraint (segundo nivel tras Zod).
--   Relación con CareRecord/INGESTA: CareRecord(type=INGESTA) es el registro
--   offline-first genérico de atención directa (JSON libre en payload).
--   IntakeRecord es el registro ESTRUCTURADO por comida (foodPct, hydrationMl,
--   meal enum) — complementario, no sustituto. El auxiliar puede usar ambos:
--   CareRecord para el flujo offline a pie de cama; IntakeRecord desde la tablet
--   del comedor cuando tiene conectividad. No se rompe ninguno de los dos.
--
-- RLS ENABLE + FORCE + política por GUC app.tenant_id — patrón idéntico al
-- resto del proyecto (misma plantilla que 20260613200000_discharge_social_wellbeing).

-- ---------------------------------------------------------------------------
-- 1. Enum MealType
-- ---------------------------------------------------------------------------

CREATE TYPE "MealType" AS ENUM (
  'DESAYUNO',
  'COMIDA',
  'MERIENDA',
  'CENA'
);

-- ---------------------------------------------------------------------------
-- 2. Enum Allergen (14 alérgenos obligatorios, Reglamento UE 1169/2011)
-- ---------------------------------------------------------------------------

CREATE TYPE "Allergen" AS ENUM (
  'GLUTEN',
  'CRUSTACEOS',
  'HUEVOS',
  'PESCADO',
  'CACAHUETES',
  'SOJA',
  'LACTEOS',
  'FRUTOS_CASCARA',
  'APIO',
  'MOSTAZA',
  'SESAMO',
  'SULFITOS',
  'ALTRAMUCES',
  'MOLUSCOS'
);

-- ---------------------------------------------------------------------------
-- 3. Tabla menu_items — menú del centro por día y comida (RF-NUT-003/004)
-- ---------------------------------------------------------------------------
-- Datos del CENTRO, no del residente. Sin residentId (no entra en DSAR).
-- centerId FK → Center (Cascade): si se borra el centro, se borran sus menús.
-- allergens almacena un array de Allergen como JSONB (Prisma Json).
-- isAlternative: plato alternativo para dietas especiales.

CREATE TABLE "menu_items" (
  "id"              TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"       TEXT         NOT NULL,
  "center_id"       TEXT         NOT NULL,
  "date"            TIMESTAMP(3) NOT NULL,
  "meal"            "MealType"   NOT NULL,
  "dish_name"       TEXT         NOT NULL,
  "description"     TEXT,
  -- Array de Allergen serializado como JSONB.
  -- Ejemplo: ["GLUTEN", "LACTEOS"]
  "allergens"       JSONB        NOT NULL DEFAULT '[]',
  -- true = plato alternativo / dieta especial (no el menú estándar del día)
  "is_alternative"  BOOLEAN      NOT NULL DEFAULT false,
  "created_by_id"   TEXT         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menu_items_center_id_fkey"
    FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE,
  CONSTRAINT "menu_items_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE INDEX "menu_items_tenant_id_idx"
  ON "menu_items"("tenant_id");
CREATE INDEX "menu_items_tenant_center_date_idx"
  ON "menu_items"("tenant_id", "center_id", "date");

-- ---------------------------------------------------------------------------
-- 4. Tabla intake_records — registro de ingesta estructurado (RF-NUT-006/007)
-- ---------------------------------------------------------------------------
-- Datos del RESIDENTE. residentId presente → entra en dsar-registry.
-- foodPct: porcentaje consumido (0-100). Validado en Zod Y por CHECK en BD.
-- hydrationMl: ml de líquido ingeridos (opcional).
-- Relación con CareRecord(type=INGESTA): son complementarios, no excluyentes.
-- CareRecord cubre el flujo offline-first genérico; IntakeRecord cubre el
-- registro estructurado por comida con porcentajes (panel de nutrición, alertas).

CREATE TABLE "intake_records" (
  "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"      TEXT         NOT NULL,
  "resident_id"    TEXT         NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "meal"           "MealType"   NOT NULL,
  -- Porcentaje de alimento consumido (0-100). CHECK como segunda línea de defensa.
  "food_pct"       INTEGER      NOT NULL,
  "hydration_ml"   INTEGER,
  "notes"          TEXT,
  "recorded_by_id" TEXT         NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "intake_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "intake_records_food_pct_check" CHECK ("food_pct" >= 0 AND "food_pct" <= 100),
  CONSTRAINT "intake_records_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "intake_records_recorded_by_id_fkey"
    FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
);

CREATE INDEX "intake_records_tenant_id_idx"
  ON "intake_records"("tenant_id");
CREATE INDEX "intake_records_tenant_resident_date_idx"
  ON "intake_records"("tenant_id", "resident_id", "date");

-- ---------------------------------------------------------------------------
-- 5. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "menu_items"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "intake_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intake_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "menu_items"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "intake_records"
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
      ON "menu_items", "intake_records"
      TO vetlla_app;
  END IF;
END $$;
