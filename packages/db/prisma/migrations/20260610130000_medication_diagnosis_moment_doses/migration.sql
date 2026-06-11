-- Migración no destructiva (Sprint medicación):
--  M-10: vínculo opcional de una prescripción a un diagnóstico del residente.
--  M-11: dosis por franja/hora (moment_doses), opcional; la dosis base sigue en `dose`.
-- Ambas columnas son nullable, así que las prescripciones existentes no cambian.
ALTER TABLE "medications" ADD COLUMN "diagnosis_id" TEXT;
ALTER TABLE "medications" ADD COLUMN "moment_doses" JSONB;

-- FK al diagnóstico: si se borra el diagnóstico, la prescripción queda sin vínculo.
ALTER TABLE "medications"
  ADD CONSTRAINT "medications_diagnosis_id_fkey"
  FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "medications_diagnosis_id_idx" ON "medications"("diagnosis_id");
