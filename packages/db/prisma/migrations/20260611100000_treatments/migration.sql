-- M-09 — Cabecera de tratamiento: agrupa líneas de prescripción bajo un objetivo
-- clínico común, con diagnóstico de referencia opcional.

-- CreateTable
CREATE TABLE "treatments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "diagnosis_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatments_tenant_id_idx" ON "treatments"("tenant_id");
CREATE INDEX "treatments_resident_id_idx" ON "treatments"("resident_id");
CREATE INDEX "treatments_diagnosis_id_idx" ON "treatments"("diagnosis_id");

-- AddForeignKey
ALTER TABLE "treatments"
  ADD CONSTRAINT "treatments_resident_id_fkey"
  FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treatments"
  ADD CONSTRAINT "treatments_diagnosis_id_fkey"
  FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: la prescripción puede ser línea de un tratamiento (opcional).
ALTER TABLE "medications" ADD COLUMN "treatment_id" TEXT;
CREATE INDEX "medications_treatment_id_idx" ON "medications"("treatment_id");
ALTER TABLE "medications"
  ADD CONSTRAINT "medications_treatment_id_fkey"
  FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: mismo patrón que el resto de tablas con tenant_id (GUC app.tenant_id + bypass).
ALTER TABLE "treatments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "treatments"
  USING (current_setting('app.bypass_rls', TRUE) = 'on'
         OR tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on'
         OR tenant_id = current_setting('app.tenant_id', TRUE));
