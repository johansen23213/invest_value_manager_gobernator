-- Migración no destructiva (UX-20): control de privacidad por vínculo familiar.
-- El centro decide qué secciones del portal ve cada familiar. Por defecto, todo
-- visible (comportamiento previo), de modo que los vínculos existentes no cambian.
ALTER TABLE "family_links" ADD COLUMN "can_see_care" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family_links" ADD COLUMN "can_see_medication" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "family_links" ADD COLUMN "can_see_assessments" BOOLEAN NOT NULL DEFAULT true;
