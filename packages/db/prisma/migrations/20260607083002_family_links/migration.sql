-- CreateTable
CREATE TABLE "family_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resident_id" TEXT NOT NULL,
    "relationship" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_links_tenant_id_idx" ON "family_links"("tenant_id");

-- CreateIndex
CREATE INDEX "family_links_user_id_idx" ON "family_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_links_user_id_resident_id_key" ON "family_links"("user_id", "resident_id");

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_links" ADD CONSTRAINT "family_links_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
