-- CreateEnum
CREATE TYPE "CenterType" AS ENUM ('RESIDENCIA', 'CENTRO_DIA', 'VIVIENDA_TUTELADA');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('DISPONIBLE', 'FUERA_SERVICIO');

-- CreateEnum
CREATE TYPE "DependencyGrade" AS ENUM ('SIN_VALORAR', 'GRADO_I', 'GRADO_II', 'GRADO_III');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('HOMBRE', 'MUJER', 'OTRO', 'NS_NC');

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('ACTIVO', 'BAJA', 'PREINGRESO');

-- CreateEnum
CREATE TYPE "ContactRelation" AS ENUM ('HIJO_A', 'CONYUGE', 'HERMANO_A', 'TUTOR_LEGAL', 'OTRO');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('LEVE', 'MODERADA', 'GRAVE');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('BARTHEL', 'TINETTI');

-- CreateTable
CREATE TABLE "centers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CenterType" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "center_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "center_id" TEXT NOT NULL,
    "bed_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "sex" "Sex",
    "national_id" TEXT,
    "dependency_grade" "DependencyGrade" NOT NULL DEFAULT 'SIN_VALORAR',
    "status" "ResidentStatus" NOT NULL DEFAULT 'ACTIVO',
    "admission_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" "ContactRelation" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "severity" "AllergySeverity",
    "reaction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "diagnosed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "score" INTEGER NOT NULL,
    "details" JSONB,
    "notes" TEXT,
    "assessed_at" TIMESTAMP(3) NOT NULL,
    "assessed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "centers_tenant_id_idx" ON "centers"("tenant_id");

-- CreateIndex
CREATE INDEX "units_tenant_id_idx" ON "units"("tenant_id");

-- CreateIndex
CREATE INDEX "units_center_id_idx" ON "units"("center_id");

-- CreateIndex
CREATE INDEX "beds_tenant_id_idx" ON "beds"("tenant_id");

-- CreateIndex
CREATE INDEX "beds_unit_id_idx" ON "beds"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "residents_bed_id_key" ON "residents"("bed_id");

-- CreateIndex
CREATE INDEX "residents_tenant_id_idx" ON "residents"("tenant_id");

-- CreateIndex
CREATE INDEX "residents_center_id_idx" ON "residents"("center_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_tenant_id_idx" ON "emergency_contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_resident_id_idx" ON "emergency_contacts"("resident_id");

-- CreateIndex
CREATE INDEX "allergies_tenant_id_idx" ON "allergies"("tenant_id");

-- CreateIndex
CREATE INDEX "allergies_resident_id_idx" ON "allergies"("resident_id");

-- CreateIndex
CREATE INDEX "diagnoses_tenant_id_idx" ON "diagnoses"("tenant_id");

-- CreateIndex
CREATE INDEX "diagnoses_resident_id_idx" ON "diagnoses"("resident_id");

-- CreateIndex
CREATE INDEX "assessments_tenant_id_idx" ON "assessments"("tenant_id");

-- CreateIndex
CREATE INDEX "assessments_resident_id_idx" ON "assessments"("resident_id");

-- AddForeignKey
ALTER TABLE "centers" ADD CONSTRAINT "centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
