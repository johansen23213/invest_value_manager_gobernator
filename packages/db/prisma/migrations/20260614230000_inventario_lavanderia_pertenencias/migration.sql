-- Inventario / Almacén + Pertenencias del residente (Lavandería incluida)
--
-- Tablas nuevas:
--   inventory_items      — stock del CENTRO (sin residentId).
--   inventory_movements  — entradas/salidas/ajustes de stock (sin residentId).
--   resident_belongings  — pertenencias personales del residente (con residentId).
--
-- Modelo de lavandería:
--   La ropa marcada se registra en resident_belongings (es una pertenencia)
--   con `label` (código de lavandería) y `status = EN_LAVANDERIA` cuando
--   está en proceso de lavado. Este diseño cubre el MVP sin sobre-modelar:
--   si en el futuro se necesitan ciclos de lavandería (recogida/entrega múltiple),
--   se añade una tabla LaunderyCycle con FK a resident_belongings. Decisión
--   documentada en el router inventario.ts.
--
-- Multitenancy / RLS:
--   Todas las tablas llevan tenant_id NOT NULL + ENABLE + FORCE + política
--   tenant_isolation. Patrón idéntico al resto del proyecto.
--
-- DSAR:
--   inventory_items / inventory_movements: sin residentId → no entra en DSAR.
--   resident_belongings: residentId → declarado en dsar-registry.ts.
--     export:true (pertenencias del interesado — art. 15).
--     anonymize:'delete' (pertenencias personales; al suprimir el residente,
--     las pertenencias se devuelven o se registra la devolución — no son
--     registro clínico con obligación de conservación sanitaria).

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "InventoryCategory" AS ENUM (
  'CONSUMIBLE',
  'ABSORBENTES',
  'HIGIENE',
  'MATERIAL_CURAS',
  'LENCERIA',
  'OTRO'
);

CREATE TYPE "MovementType" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

CREATE TYPE "BelongingCategory" AS ENUM (
  'ROPA',
  'CALZADO',
  'ELECTRONICA',
  'JOYERIA',
  'DOCUMENTO',
  'OTRO'
);

CREATE TYPE "BelongingStatus" AS ENUM (
  'EN_USO',
  'ALMACENADO',
  'EN_LAVANDERIA',
  'DEVUELTO',
  'PERDIDO'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla inventory_items (stock del centro — sin residentId)
-- ---------------------------------------------------------------------------

CREATE TABLE "inventory_items" (
  "id"         TEXT                  NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"  TEXT                  NOT NULL,
  "name"       TEXT                  NOT NULL,
  "category"   "InventoryCategory"   NOT NULL DEFAULT 'OTRO',
  "unit"       TEXT                  NOT NULL,
  "stock"      INTEGER               NOT NULL DEFAULT 0,
  "stock_min"  INTEGER               NOT NULL DEFAULT 0,
  "location"   TEXT,
  "active"     BOOLEAN               NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_items_tenant_id_idx"
  ON "inventory_items"("tenant_id");

CREATE INDEX "inventory_items_tenant_id_category_idx"
  ON "inventory_items"("tenant_id", "category");

CREATE INDEX "inventory_items_tenant_id_active_idx"
  ON "inventory_items"("tenant_id", "active");

-- ---------------------------------------------------------------------------
-- 3. Tabla inventory_movements (entradas/salidas/ajustes — sin residentId)
-- ---------------------------------------------------------------------------

CREATE TABLE "inventory_movements" (
  "id"         TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"  TEXT          NOT NULL,
  "item_id"    TEXT          NOT NULL,
  "type"       "MovementType" NOT NULL,
  "quantity"   INTEGER       NOT NULL,
  "reason"     TEXT,
  "moved_at"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id"    TEXT,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "inventory_movements_item_id_fkey"
    FOREIGN KEY ("item_id")
    REFERENCES "inventory_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "inventory_movements_tenant_id_idx"
  ON "inventory_movements"("tenant_id");

CREATE INDEX "inventory_movements_tenant_id_item_id_idx"
  ON "inventory_movements"("tenant_id", "item_id");

CREATE INDEX "inventory_movements_tenant_id_moved_at_idx"
  ON "inventory_movements"("tenant_id", "moved_at");

-- ---------------------------------------------------------------------------
-- 4. Tabla resident_belongings (pertenencias del residente — con residentId)
-- ---------------------------------------------------------------------------

CREATE TABLE "resident_belongings" (
  "id"            TEXT                 NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"     TEXT                 NOT NULL,
  "resident_id"   TEXT                 NOT NULL,
  "description"   TEXT                 NOT NULL,
  "category"      "BelongingCategory"  NOT NULL DEFAULT 'OTRO',
  "quantity"      INTEGER              NOT NULL DEFAULT 1,
  "label"         TEXT,
  "status"        "BelongingStatus"    NOT NULL DEFAULT 'EN_USO',
  "registered_at" TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"         TEXT,
  "created_at"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resident_belongings_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "resident_belongings_resident_id_fkey"
    FOREIGN KEY ("resident_id")
    REFERENCES "residents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "resident_belongings_tenant_id_idx"
  ON "resident_belongings"("tenant_id");

CREATE INDEX "resident_belongings_tenant_id_resident_id_idx"
  ON "resident_belongings"("tenant_id", "resident_id");

CREATE INDEX "resident_belongings_tenant_id_status_idx"
  ON "resident_belongings"("tenant_id", "status");

-- ---------------------------------------------------------------------------
-- 5. Triggers updated_at
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

CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON "inventory_items"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER resident_belongings_updated_at
  BEFORE UPDATE ON "resident_belongings"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS — Row-Level Security (ENABLE + FORCE + política tenant_isolation)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "inventory_items"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items"     FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "inventory_items"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "inventory_movements"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

ALTER TABLE "resident_belongings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resident_belongings" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "resident_belongings"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

-- ---------------------------------------------------------------------------
-- 7. Grants para el rol de aplicación vetlla_app (NOBYPASSRLS).
--    Idempotente: DO $$ protege contra el rol inexistente en deploy fresco.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetlla_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory_items"     TO vetlla_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory_movements" TO vetlla_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "resident_belongings" TO vetlla_app;
  END IF;
END $$;
