-- Facturación básica (RF-ECO-001..005)
--
-- Crea los enums nuevos (BillingUnit, InvoiceStatus, PayerType), las cuatro
-- tablas (tariffs, resident_billing_profiles, invoices, invoice_lines) y aplica
-- RLS ENABLE + FORCE + política tenant_isolation por GUC app.tenant_id.
--
-- BLOQUEADO (fuera de alcance de esta migración):
--   Q-007 — Pasarela de pago / cobro digital real + remesas SEPA XML.
--   Q-012 — Verifactu (factura electrónica AEAT).
--
-- Numeración de factura sin huecos:
--   El número correlativo (invoice_number) se asigna al pasar a ISSUED dentro
--   de una transacción SERIALIZABLE que bloquea el máximo actual por tenant+año.
--   Esto evita la carrera de "dos hilos intentan issue a la vez" sin necesidad
--   de una secuencia por-tenant (habría requerido DDL dinámico en cada signup).
--   La restricción UNIQUE (tenant_id, invoice_year, series, invoice_number)
--   actúa como última red de seguridad anti-duplicado.

-- ---------------------------------------------------------------------------
-- 1. Enums nuevos
-- ---------------------------------------------------------------------------

CREATE TYPE "BillingUnit" AS ENUM (
  'MENSUAL',
  'DIARIO',
  'UNICO'
);

CREATE TYPE "InvoiceStatus" AS ENUM (
  'DRAFT',
  'ISSUED',
  'PAID',
  'VOID'
);

CREATE TYPE "PayerType" AS ENUM (
  'RESIDENTE',
  'FAMILIAR',
  'ADMINISTRACION'
);

-- ---------------------------------------------------------------------------
-- 2. Tabla tariffs — conceptos facturables del centro
-- ---------------------------------------------------------------------------

CREATE TABLE "tariffs" (
  "id"          TEXT           NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT           NOT NULL,
  "code"        TEXT           NOT NULL,
  "name"        TEXT           NOT NULL,
  "base_amount" DECIMAL(12, 2) NOT NULL,
  "unit"        "BillingUnit"  NOT NULL,
  "vat_pct"     DECIMAL(5, 2)  NOT NULL DEFAULT 0,
  "vat_exempt"  BOOLEAN        NOT NULL DEFAULT TRUE,
  "active"      BOOLEAN        NOT NULL DEFAULT TRUE,
  "valid_from"  TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tariffs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tariffs_tenant_code_unique"
    UNIQUE ("tenant_id", "code"),
  CONSTRAINT "tariffs_base_amount_check"
    CHECK ("base_amount" >= 0),
  CONSTRAINT "tariffs_vat_pct_check"
    CHECK ("vat_pct" >= 0 AND "vat_pct" <= 100)
);

CREATE INDEX "tariffs_tenant_id_idx" ON "tariffs"("tenant_id");

-- ---------------------------------------------------------------------------
-- 3. Tabla resident_billing_profiles — configuración de facturación por residente
-- ---------------------------------------------------------------------------

CREATE TABLE "resident_billing_profiles" (
  "id"               TEXT           NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"        TEXT           NOT NULL,
  "resident_id"      TEXT           NOT NULL,
  "tariff_id"        TEXT,
  "public_copay_pct" DECIMAL(5, 2)  NOT NULL DEFAULT 0,
  "private_pct"      DECIMAL(5, 2)  NOT NULL DEFAULT 100,
  "payer_type"       "PayerType"    NOT NULL DEFAULT 'FAMILIAR',
  "payer_name"       TEXT,
  -- TODO Q-007: al activar cobro digital, añadir iban_encrypted, bic, mandate_date
  "sepa_mandate"     TEXT,          -- referencia del mandato SEPA (NO el IBAN)
  "notes"            TEXT,
  "created_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "resident_billing_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resident_billing_profiles_resident_id_unique"
    UNIQUE ("resident_id"),
  CONSTRAINT "resident_billing_profiles_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE,
  CONSTRAINT "resident_billing_profiles_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL,
  CONSTRAINT "resident_billing_profiles_copay_pct_check"
    CHECK ("public_copay_pct" >= 0 AND "public_copay_pct" <= 100),
  CONSTRAINT "resident_billing_profiles_private_pct_check"
    CHECK ("private_pct" >= 0 AND "private_pct" <= 100)
);

CREATE INDEX "resident_billing_profiles_tenant_id_idx" ON "resident_billing_profiles"("tenant_id");

-- ---------------------------------------------------------------------------
-- 4. Tabla invoices — cabecera de factura
-- ---------------------------------------------------------------------------

CREATE TABLE "invoices" (
  "id"             TEXT           NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"      TEXT           NOT NULL,
  "resident_id"    TEXT           NOT NULL,
  "invoice_number" INTEGER,                 -- null en DRAFT; se asigna al ISSUE
  "invoice_year"   INTEGER,                 -- ejercicio fiscal (YYYY); null en DRAFT
  "series"         TEXT           NOT NULL DEFAULT 'A',
  "period_start"   TIMESTAMP(3)   NOT NULL,
  "period_end"     TIMESTAMP(3)   NOT NULL,
  "issued_at"      TIMESTAMP(3),            -- null en DRAFT
  "due_at"         TIMESTAMP(3),
  "status"         "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "void_reason"    TEXT,
  "paid_at"        TIMESTAMP(3),
  "payer_type"     "PayerType"    NOT NULL,
  "payer_name"     TEXT,
  "base_amount"    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "vat_amount"     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "total_amount"   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "notes"          TEXT,
  "created_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_resident_id_fkey"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE RESTRICT,
  -- Unicidad correlativa (solo activa cuando el número es asignado = ISSUED+)
  CONSTRAINT "invoices_number_unique"
    UNIQUE ("tenant_id", "invoice_year", "series", "invoice_number"),
  CONSTRAINT "invoices_amounts_check"
    CHECK ("base_amount" >= 0 AND "vat_amount" >= 0 AND "total_amount" >= 0)
);

CREATE INDEX "invoices_tenant_id_idx"           ON "invoices"("tenant_id");
CREATE INDEX "invoices_tenant_resident_idx"     ON "invoices"("tenant_id", "resident_id");
CREATE INDEX "invoices_tenant_status_idx"       ON "invoices"("tenant_id", "status");
CREATE INDEX "invoices_tenant_period_start_idx" ON "invoices"("tenant_id", "period_start");

-- ---------------------------------------------------------------------------
-- 5. Tabla invoice_lines — líneas de factura
-- ---------------------------------------------------------------------------

CREATE TABLE "invoice_lines" (
  "id"          TEXT           NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "tenant_id"   TEXT           NOT NULL,
  "invoice_id"  TEXT           NOT NULL,
  "tariff_id"   TEXT,
  "description" TEXT           NOT NULL,
  "quantity"    DECIMAL(10, 4) NOT NULL,
  "unit_price"  DECIMAL(12, 2) NOT NULL,
  "vat_pct"     DECIMAL(5, 2)  NOT NULL DEFAULT 0,
  "vat_exempt"  BOOLEAN        NOT NULL DEFAULT TRUE,
  "line_base"   DECIMAL(12, 2) NOT NULL,
  "line_vat"    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "line_total"  DECIMAL(12, 2) NOT NULL,
  "sort_order"  INTEGER        NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_lines_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE,
  CONSTRAINT "invoice_lines_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE SET NULL,
  CONSTRAINT "invoice_lines_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "invoice_lines_unit_price_check"
    CHECK ("unit_price" >= 0)
);

CREATE INDEX "invoice_lines_tenant_id_idx"  ON "invoice_lines"("tenant_id");
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- ---------------------------------------------------------------------------
-- 6. RLS — Row-Level Security (ENABLE + FORCE + política por tenant_id)
--    Patrón idéntico al resto del proyecto: GUC app.tenant_id + bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE "tariffs"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tariffs"                    FORCE ROW LEVEL SECURITY;
ALTER TABLE "resident_billing_profiles"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resident_billing_profiles"  FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                   FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines"              FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "tariffs"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "resident_billing_profiles"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "invoices"
  USING (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  )
  WITH CHECK (
    current_setting('app.bypass_rls', TRUE) = 'on'
    OR tenant_id = current_setting('app.tenant_id', TRUE)
  );

CREATE POLICY tenant_isolation ON "invoice_lines"
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
      ON "tariffs", "resident_billing_profiles", "invoices", "invoice_lines"
      TO vetlla_app;
  END IF;
END $$;
