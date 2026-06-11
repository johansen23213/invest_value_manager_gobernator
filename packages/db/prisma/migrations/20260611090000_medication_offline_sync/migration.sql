-- ADR-0012 — MAR offline: timestamp LWW del evento + tabla de conflictos de medicación.

-- AlterTable: momento de registro en el dispositivo (decide el last-write-wins por evento).
ALTER TABLE "medication_administrations"
  ADD COLUMN "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "medication_sync_conflicts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "administration_id" TEXT NOT NULL,
    "server_event" JSONB NOT NULL,
    "client_event" JSONB NOT NULL,
    "winner" "ConflictWinner" NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_sync_conflicts_tenant_id_idx" ON "medication_sync_conflicts"("tenant_id");
CREATE INDEX "medication_sync_conflicts_administration_id_idx" ON "medication_sync_conflicts"("administration_id");

-- AddForeignKey
ALTER TABLE "medication_sync_conflicts"
  ADD CONSTRAINT "medication_sync_conflicts_administration_id_fkey"
  FOREIGN KEY ("administration_id") REFERENCES "medication_administrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: mismo patrón que el resto de tablas con tenant_id (GUC app.tenant_id + bypass).
ALTER TABLE "medication_sync_conflicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medication_sync_conflicts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "medication_sync_conflicts"
  USING (current_setting('app.bypass_rls', TRUE) = 'on'
         OR tenant_id = current_setting('app.tenant_id', TRUE))
  WITH CHECK (current_setting('app.bypass_rls', TRUE) = 'on'
         OR tenant_id = current_setting('app.tenant_id', TRUE));
