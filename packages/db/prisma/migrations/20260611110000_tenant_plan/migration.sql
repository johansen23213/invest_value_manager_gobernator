-- Pricing por plaza/módulo: plan de suscripción del tenant (el catálogo de
-- precios y módulos vive en código; aquí solo el tier y el fin de la prueba).
-- Los tenants existentes pasan a PROFESIONAL (clientes previos al pricing:
-- no se les degrada funcionalidad).

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'ESENCIAL', 'PROFESIONAL');

-- AlterTable
ALTER TABLE "tenants"
  ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "trial_ends_at" TIMESTAMP(3);

UPDATE "tenants" SET "plan" = 'PROFESIONAL';
