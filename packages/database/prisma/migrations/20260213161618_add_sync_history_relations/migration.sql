-- AlterTable
ALTER TABLE "vision_iq_pexels_image_descriptions" ADD COLUMN     "keywordId" TEXT;

-- AlterTable
ALTER TABLE "vision_iq_pexels_sync_history" ADD COLUMN     "descriptionId" TEXT,
ADD COLUMN     "keywordId" TEXT;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_image_descriptions" ADD CONSTRAINT "vision_iq_pexels_image_descriptions_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "vision_iq_visual_description_keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_sync_history" ADD CONSTRAINT "vision_iq_pexels_sync_history_descriptionId_fkey" FOREIGN KEY ("descriptionId") REFERENCES "vision_iq_visual_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_sync_history" ADD CONSTRAINT "vision_iq_pexels_sync_history_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "vision_iq_visual_description_keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;
