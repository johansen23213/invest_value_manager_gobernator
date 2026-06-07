-- CreateEnum
CREATE TYPE "MedAdminStatus" AS ENUM ('ADMINISTRADO', 'NO_ADMINISTRADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVO', 'CERRADO');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'CONSEGUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT,
    "times" JSONB NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "prescribed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_administrations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "medication_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "MedAdminStatus" NOT NULL,
    "administered_at" TIMESTAMP(3),
    "administered_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVO',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plan_goals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "care_plan_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'PENDIENTE',
    "target_date" TIMESTAMP(3),
    "progress_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plan_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plan_reviews" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "care_plan_id" TEXT NOT NULL,
    "review_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_plan_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medications_tenant_id_idx" ON "medications"("tenant_id");

-- CreateIndex
CREATE INDEX "medications_resident_id_idx" ON "medications"("resident_id");

-- CreateIndex
CREATE INDEX "medication_administrations_tenant_id_idx" ON "medication_administrations"("tenant_id");

-- CreateIndex
CREATE INDEX "medication_administrations_resident_id_idx" ON "medication_administrations"("resident_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_administrations_tenant_id_medication_id_schedule_key" ON "medication_administrations"("tenant_id", "medication_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "care_plans_tenant_id_idx" ON "care_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "care_plans_resident_id_idx" ON "care_plans"("resident_id");

-- CreateIndex
CREATE INDEX "care_plan_goals_tenant_id_idx" ON "care_plan_goals"("tenant_id");

-- CreateIndex
CREATE INDEX "care_plan_goals_care_plan_id_idx" ON "care_plan_goals"("care_plan_id");

-- CreateIndex
CREATE INDEX "care_plan_reviews_tenant_id_idx" ON "care_plan_reviews"("tenant_id");

-- CreateIndex
CREATE INDEX "care_plan_reviews_care_plan_id_idx" ON "care_plan_reviews"("care_plan_id");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plan_goals" ADD CONSTRAINT "care_plan_goals_care_plan_id_fkey" FOREIGN KEY ("care_plan_id") REFERENCES "care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plan_reviews" ADD CONSTRAINT "care_plan_reviews_care_plan_id_fkey" FOREIGN KEY ("care_plan_id") REFERENCES "care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
