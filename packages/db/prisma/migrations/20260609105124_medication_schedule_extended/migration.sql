-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('ORAL', 'SUBLINGUAL', 'SUBCUTANEA', 'INTRAMUSCULAR', 'INTRAVENOSA', 'TOPICA', 'INHALATORIA', 'TRANSDERMICA', 'RECTAL', 'OCULAR', 'NASAL', 'OTRA');

-- CreateEnum
CREATE TYPE "MedicationType" AS ENUM ('CRONICO', 'AGUDO', 'PRN');

-- AlterTable: añadir columnas nuevas
ALTER TABLE "medications"
  ADD COLUMN "days_of_week" JSONB,
  ADD COLUMN "type"         "MedicationType",
  ADD COLUMN "unit"         TEXT;

-- Migrar route String → MedicationRoute con mapeo de valores existentes.
-- Estrategia: columna temporal, casteo con CASE, eliminar original, renombrar.
ALTER TABLE "medications" ADD COLUMN "route_new" "MedicationRoute";

UPDATE "medications"
SET "route_new" = CASE
  WHEN lower(trim("route")) IN ('oral')                          THEN 'ORAL'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('sublingual')                    THEN 'SUBLINGUAL'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('subcutanea','subcutánea','sc','s.c.') THEN 'SUBCUTANEA'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('intramuscular','im','i.m.')     THEN 'INTRAMUSCULAR'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('intravenosa','iv','i.v.')       THEN 'INTRAVENOSA'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('topica','tópica','topico','tópico','cutanea','cutánea') THEN 'TOPICA'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('inhalatoria','inhalada','inhaler','inhalatorio') THEN 'INHALATORIA'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('transdermica','transdérmica','parche') THEN 'TRANSDERMICA'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('rectal')                        THEN 'RECTAL'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('ocular','oftálmica','oftalmica') THEN 'OCULAR'::"MedicationRoute"
  WHEN lower(trim("route")) IN ('nasal')                         THEN 'NASAL'::"MedicationRoute"
  WHEN "route" IS NOT NULL AND trim("route") <> ''               THEN 'OTRA'::"MedicationRoute"
  ELSE NULL
END;

-- Eliminar columna original (String) y renombrar la nueva (enum)
ALTER TABLE "medications" DROP COLUMN "route";
ALTER TABLE "medications" RENAME COLUMN "route_new" TO "route";
