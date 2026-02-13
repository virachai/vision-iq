-- CreateEnum
CREATE TYPE "OrchestrationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "vision_iq_image_analysis_jobs" ADD COLUMN     "rawResponse" TEXT;

-- AlterTable
ALTER TABLE "vision_iq_scene_intents" ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "vision_iq_visual_intent_requests" (
    "id" TEXT NOT NULL,
    "rawGeminiText" TEXT NOT NULL,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_intent_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_visual_descriptions" (
    "id" TEXT NOT NULL,
    "sceneIntentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "analysis" JSONB,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_pexels_image_descriptions" (
    "id" TEXT NOT NULL,
    "descriptionId" TEXT NOT NULL,
    "pexelsImageId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "discoveryMethod" TEXT NOT NULL DEFAULT 'SEARCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_iq_pexels_image_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_pexels_sync_history" (
    "id" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "totalImages" INTEGER NOT NULL DEFAULT 0,
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "jobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_pexels_sync_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vision_iq_visual_descriptions_sceneIntentId_idx" ON "vision_iq_visual_descriptions"("sceneIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_pexels_image_descriptions_descriptionId_pexelsIma_key" ON "vision_iq_pexels_image_descriptions"("descriptionId", "pexelsImageId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_sync_history_status_idx" ON "vision_iq_pexels_sync_history"("status");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_sync_history_createdAt_idx" ON "vision_iq_pexels_sync_history"("createdAt");

-- CreateIndex
CREATE INDEX "vision_iq_scene_intents_requestId_idx" ON "vision_iq_scene_intents"("requestId");

-- AddForeignKey
ALTER TABLE "vision_iq_scene_intents" ADD CONSTRAINT "vision_iq_scene_intents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "vision_iq_visual_intent_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_visual_descriptions" ADD CONSTRAINT "vision_iq_visual_descriptions_sceneIntentId_fkey" FOREIGN KEY ("sceneIntentId") REFERENCES "vision_iq_scene_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_image_descriptions" ADD CONSTRAINT "vision_iq_pexels_image_descriptions_descriptionId_fkey" FOREIGN KEY ("descriptionId") REFERENCES "vision_iq_visual_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_image_descriptions" ADD CONSTRAINT "vision_iq_pexels_image_descriptions_pexelsImageId_fkey" FOREIGN KEY ("pexelsImageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
