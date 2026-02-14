-- CreateTable
CREATE TABLE "vision_iq_visual_intent_analysis" (
    "id" TEXT NOT NULL,
    "pexelsImageId" TEXT NOT NULL,
    "coreIntent" JSONB,
    "spatialStrategy" JSONB,
    "subjectTreatment" JSONB,
    "colorPsychology" JSONB,
    "emotionalArchitecture" JSONB,
    "metaphoricalLayer" JSONB,
    "cinematicLeverage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_intent_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_visual_intent_analysis_pexelsImageId_key" ON "vision_iq_visual_intent_analysis"("pexelsImageId");

-- CreateIndex
CREATE INDEX "vision_iq_visual_intent_analysis_pexelsImageId_idx" ON "vision_iq_visual_intent_analysis"("pexelsImageId");

-- AddForeignKey
ALTER TABLE "vision_iq_visual_intent_analysis" ADD CONSTRAINT "vision_iq_visual_intent_analysis_pexelsImageId_fkey" FOREIGN KEY ("pexelsImageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
