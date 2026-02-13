-- AlterTable
ALTER TABLE "vision_iq_image_analysis_jobs" ADD COLUMN     "isUsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vision_iq_pexels_images" ADD COLUMN     "alt" TEXT,
ADD COLUMN     "source" TEXT DEFAULT 'SYNC_PEXELS';

-- CreateTable
CREATE TABLE "vision_iq_visual_description_keywords" (
    "id" TEXT NOT NULL,
    "descriptionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_description_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vision_iq_visual_description_keywords_descriptionId_idx" ON "vision_iq_visual_description_keywords"("descriptionId");

-- CreateIndex
CREATE INDEX "vision_iq_visual_description_keywords_isUsed_idx" ON "vision_iq_visual_description_keywords"("isUsed");

-- CreateIndex
CREATE INDEX "vision_iq_image_analysis_jobs_isUsed_idx" ON "vision_iq_image_analysis_jobs"("isUsed");

-- AddForeignKey
ALTER TABLE "vision_iq_visual_description_keywords" ADD CONSTRAINT "vision_iq_visual_description_keywords_descriptionId_fkey" FOREIGN KEY ("descriptionId") REFERENCES "vision_iq_visual_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
