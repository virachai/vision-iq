-- AlterTable: Add sync progress tracking columns
ALTER TABLE "vision_iq_pexels_sync_history" ADD COLUMN "lastPageSynced" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vision_iq_pexels_sync_history" ADD COLUMN "totalPages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "vision_iq_pexels_sync_history" ADD COLUMN "totalImages" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Index on syncStatus for recovery cron queries
CREATE INDEX "vision_iq_pexels_sync_history_syncStatus_idx" ON "vision_iq_pexels_sync_history"("syncStatus");
