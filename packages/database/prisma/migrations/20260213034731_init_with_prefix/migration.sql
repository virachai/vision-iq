-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "vision_iq_users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),

    CONSTRAINT "vision_iq_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_pexels_images" (
    "id" TEXT NOT NULL,
    "pexelsId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "photographer" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "avgColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_pexels_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_image_embeddings" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_image_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_image_metadata" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "visualWeight" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "composition" JSONB NOT NULL,
    "moodDna" JSONB NOT NULL,
    "metaphoricalTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_image_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_image_analysis_jobs" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_image_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_scene_intents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "intent" TEXT NOT NULL,
    "requiredImpact" DOUBLE PRECISION NOT NULL,
    "composition" JSONB NOT NULL,
    "moodAnchor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_scene_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_users_email_key" ON "vision_iq_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_pexels_images_pexelsId_key" ON "vision_iq_pexels_images"("pexelsId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_images_pexelsId_idx" ON "vision_iq_pexels_images"("pexelsId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_image_embeddings_imageId_key" ON "vision_iq_image_embeddings"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_embeddings_imageId_idx" ON "vision_iq_image_embeddings"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_image_metadata_imageId_key" ON "vision_iq_image_metadata"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_metadata_imageId_idx" ON "vision_iq_image_metadata"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_metadata_impactScore_idx" ON "vision_iq_image_metadata"("impactScore");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_image_analysis_jobs_imageId_key" ON "vision_iq_image_analysis_jobs"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_analysis_jobs_status_idx" ON "vision_iq_image_analysis_jobs"("status");

-- CreateIndex
CREATE INDEX "vision_iq_image_analysis_jobs_imageId_idx" ON "vision_iq_image_analysis_jobs"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_scene_intents_projectId_idx" ON "vision_iq_scene_intents"("projectId");

-- CreateIndex
CREATE INDEX "vision_iq_scene_intents_sceneIndex_idx" ON "vision_iq_scene_intents"("sceneIndex");

-- AddForeignKey
ALTER TABLE "vision_iq_image_embeddings" ADD CONSTRAINT "vision_iq_image_embeddings_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_image_metadata" ADD CONSTRAINT "vision_iq_image_metadata_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_image_analysis_jobs" ADD CONSTRAINT "vision_iq_image_analysis_jobs_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
