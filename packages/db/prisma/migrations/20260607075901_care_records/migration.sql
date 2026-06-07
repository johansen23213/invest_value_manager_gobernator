-- CreateEnum
CREATE TYPE "CareRecordType" AS ENUM ('CONSTANTES', 'ABVD', 'DEPOSICION', 'INGESTA', 'INCIDENCIA');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictWinner" AS ENUM ('SERVER', 'CLIENT');

-- CreateTable
CREATE TABLE "care_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "type" "CareRecordType" NOT NULL,
    "client_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "field_timestamps" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "author_id" TEXT NOT NULL,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "care_record_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "server_value" JSONB,
    "client_value" JSONB,
    "winner" "ConflictWinner" NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_records_tenant_id_idx" ON "care_records"("tenant_id");

-- CreateIndex
CREATE INDEX "care_records_resident_id_idx" ON "care_records"("resident_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_records_tenant_id_client_id_key" ON "care_records"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_tenant_id_idx" ON "sync_conflicts"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_care_record_id_idx" ON "sync_conflicts"("care_record_id");

-- AddForeignKey
ALTER TABLE "care_records" ADD CONSTRAINT "care_records_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_care_record_id_fkey" FOREIGN KEY ("care_record_id") REFERENCES "care_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
