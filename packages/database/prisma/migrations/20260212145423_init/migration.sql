-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PexelsImage" (
    "id" TEXT NOT NULL,
    "pexelsId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "photographer" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "avgColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PexelsImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageEmbedding" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageMetadata" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "visualWeight" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "composition" JSONB NOT NULL,
    "moodDna" JSONB NOT NULL,
    "metaphoricalTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAnalysisJob" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneIntent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "intent" TEXT NOT NULL,
    "requiredImpact" DOUBLE PRECISION NOT NULL,
    "composition" JSONB NOT NULL,
    "moodAnchor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PexelsImage_pexelsId_key" ON "PexelsImage"("pexelsId");

-- CreateIndex
CREATE INDEX "PexelsImage_pexelsId_idx" ON "PexelsImage"("pexelsId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageEmbedding_imageId_key" ON "ImageEmbedding"("imageId");

-- CreateIndex
CREATE INDEX "ImageEmbedding_imageId_idx" ON "ImageEmbedding"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageMetadata_imageId_key" ON "ImageMetadata"("imageId");

-- CreateIndex
CREATE INDEX "ImageMetadata_imageId_idx" ON "ImageMetadata"("imageId");

-- CreateIndex
CREATE INDEX "ImageMetadata_impactScore_idx" ON "ImageMetadata"("impactScore");

-- CreateIndex
CREATE UNIQUE INDEX "ImageAnalysisJob_imageId_key" ON "ImageAnalysisJob"("imageId");

-- CreateIndex
CREATE INDEX "ImageAnalysisJob_status_idx" ON "ImageAnalysisJob"("status");

-- CreateIndex
CREATE INDEX "ImageAnalysisJob_imageId_idx" ON "ImageAnalysisJob"("imageId");

-- CreateIndex
CREATE INDEX "SceneIntent_projectId_idx" ON "SceneIntent"("projectId");

-- CreateIndex
CREATE INDEX "SceneIntent_sceneIndex_idx" ON "SceneIntent"("sceneIndex");

-- AddForeignKey
ALTER TABLE "ImageEmbedding" ADD CONSTRAINT "ImageEmbedding_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "PexelsImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageMetadata" ADD CONSTRAINT "ImageMetadata_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "PexelsImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAnalysisJob" ADD CONSTRAINT "ImageAnalysisJob_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "PexelsImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
