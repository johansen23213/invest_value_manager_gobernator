-- Migración no destructiva: añade job_title a users.
-- R-01 (Wave B Sprint M): etiqueta de función por usuario.

ALTER TABLE "users" ADD COLUMN "job_title" TEXT;
