-- CreateTable
CREATE TABLE "vision_iq_deepseek_analysis" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL,
    "visualWeight" DOUBLE PRECISION NOT NULL,
    "composition" JSONB NOT NULL,
    "colorProfile" JSONB NOT NULL,
    "moodDna" JSONB NOT NULL,
    "metaphoricalTags" TEXT[],
    "cinematicNotes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_deepseek_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_deepseek_analysis_imageId_key" ON "vision_iq_deepseek_analysis"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_deepseek_analysis_jobId_key" ON "vision_iq_deepseek_analysis"("jobId");

-- CreateIndex
CREATE INDEX "vision_iq_deepseek_analysis_imageId_idx" ON "vision_iq_deepseek_analysis"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_deepseek_analysis_jobId_idx" ON "vision_iq_deepseek_analysis"("jobId");

-- AddForeignKey
ALTER TABLE "vision_iq_deepseek_analysis" ADD CONSTRAINT "vision_iq_deepseek_analysis_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_deepseek_analysis" ADD CONSTRAINT "vision_iq_deepseek_analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vision_iq_image_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
