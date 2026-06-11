-- Revisión humana de divergencias de sincronización (R-CONF).
-- El LWW ya resolvió el dato; estas columnas registran que un humano lo validó.
-- reviewed_at NULL = pendiente de revisar.

ALTER TABLE "sync_conflicts"
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_id" TEXT;

ALTER TABLE "medication_sync_conflicts"
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_id" TEXT;

CREATE INDEX "sync_conflicts_tenant_id_reviewed_at_idx"
  ON "sync_conflicts"("tenant_id", "reviewed_at");
CREATE INDEX "medication_sync_conflicts_tenant_id_reviewed_at_idx"
  ON "medication_sync_conflicts"("tenant_id", "reviewed_at");
