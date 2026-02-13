-- CreateTable
CREATE TABLE "vision_iq_pexels_sync_images" (
    "id" TEXT NOT NULL,
    "syncHistoryId" TEXT NOT NULL,
    "pexelsImageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_iq_pexels_sync_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vision_iq_pexels_sync_images_syncHistoryId_idx" ON "vision_iq_pexels_sync_images"("syncHistoryId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_sync_images_pexelsImageId_idx" ON "vision_iq_pexels_sync_images"("pexelsImageId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_pexels_sync_images_syncHistoryId_pexelsImageId_key" ON "vision_iq_pexels_sync_images"("syncHistoryId", "pexelsImageId");

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_sync_images" ADD CONSTRAINT "vision_iq_pexels_sync_images_syncHistoryId_fkey" FOREIGN KEY ("syncHistoryId") REFERENCES "vision_iq_pexels_sync_history"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_sync_images" ADD CONSTRAINT "vision_iq_pexels_sync_images_pexelsImageId_fkey" FOREIGN KEY ("pexelsImageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
