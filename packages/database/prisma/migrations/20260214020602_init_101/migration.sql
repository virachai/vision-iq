-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrchestrationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApiProvider" AS ENUM ('PEXELS', 'DEEPSEEK', 'OPENAI', 'GEMINI');

-- CreateTable
CREATE TABLE "vision_iq_users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),

    CONSTRAINT "vision_iq_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_visual_intent_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rawGeminiText" TEXT NOT NULL,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_intent_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_scene_intents" (
    "id" TEXT NOT NULL,
    "visualIntentRequestId" TEXT NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "intent" TEXT NOT NULL,
    "requiredImpact" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "composition" JSONB NOT NULL,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_scene_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_visual_descriptions" (
    "id" TEXT NOT NULL,
    "sceneIntentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_visual_description_keywords" (
    "id" TEXT NOT NULL,
    "visualDescriptionId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_visual_description_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_pexels_sync_history" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncAttempt" INTEGER NOT NULL DEFAULT 1,
    "apiResponse" JSONB,
    "errorMessage" TEXT,
    "syncedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_pexels_sync_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_pexels_images" (
    "id" TEXT NOT NULL,
    "syncHistoryId" TEXT NOT NULL,
    "pexelsImageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "photographer" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "avgColor" TEXT,
    "alt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_pexels_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_image_analysis_jobs" (
    "id" TEXT NOT NULL,
    "pexelsImageId" TEXT NOT NULL,
    "jobStatus" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" "ApiProvider" NOT NULL DEFAULT 'DEEPSEEK',
    "payload" JSONB,
    "rawApiResponse" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_image_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_deepseek_analysis" (
    "id" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'deepseek-v3',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "analysisResult" JSONB NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_deepseek_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_api_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "provider" "ApiProvider" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_iq_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_analysis_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_iq_analysis_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "vision_iq_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vision_iq_description_tag_map" (
    "descriptionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "vision_iq_description_tag_map_pkey" PRIMARY KEY ("descriptionId","tagId")
);

-- CreateTable
CREATE TABLE "vision_iq_image_embeddings" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vision_iq_image_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_users_email_key" ON "vision_iq_users"("email");

-- CreateIndex
CREATE INDEX "vision_iq_visual_intent_requests_userId_idx" ON "vision_iq_visual_intent_requests"("userId");

-- CreateIndex
CREATE INDEX "vision_iq_visual_intent_requests_status_idx" ON "vision_iq_visual_intent_requests"("status");

-- CreateIndex
CREATE INDEX "vision_iq_scene_intents_visualIntentRequestId_idx" ON "vision_iq_scene_intents"("visualIntentRequestId");

-- CreateIndex
CREATE INDEX "vision_iq_scene_intents_visualIntentRequestId_createdAt_idx" ON "vision_iq_scene_intents"("visualIntentRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "vision_iq_visual_descriptions_sceneIntentId_idx" ON "vision_iq_visual_descriptions"("sceneIntentId");

-- CreateIndex
CREATE INDEX "vision_iq_visual_descriptions_sceneIntentId_createdAt_idx" ON "vision_iq_visual_descriptions"("sceneIntentId", "createdAt");

-- CreateIndex
CREATE INDEX "vision_iq_visual_description_keywords_visualDescriptionId_idx" ON "vision_iq_visual_description_keywords"("visualDescriptionId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_sync_history_keywordId_idx" ON "vision_iq_pexels_sync_history"("keywordId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_pexels_images_pexelsImageId_key" ON "vision_iq_pexels_images"("pexelsImageId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_images_syncHistoryId_idx" ON "vision_iq_pexels_images"("syncHistoryId");

-- CreateIndex
CREATE INDEX "vision_iq_pexels_images_pexelsImageId_idx" ON "vision_iq_pexels_images"("pexelsImageId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_image_analysis_jobs_pexelsImageId_key" ON "vision_iq_image_analysis_jobs"("pexelsImageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_analysis_jobs_pexelsImageId_idx" ON "vision_iq_image_analysis_jobs"("pexelsImageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_analysis_jobs_jobStatus_provider_idx" ON "vision_iq_image_analysis_jobs"("jobStatus", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_deepseek_analysis_analysisJobId_key" ON "vision_iq_deepseek_analysis"("analysisJobId");

-- CreateIndex
CREATE INDEX "vision_iq_deepseek_analysis_analysisJobId_idx" ON "vision_iq_deepseek_analysis"("analysisJobId");

-- CreateIndex
CREATE INDEX "vision_iq_api_logs_jobId_idx" ON "vision_iq_api_logs"("jobId");

-- CreateIndex
CREATE INDEX "vision_iq_analysis_events_jobId_idx" ON "vision_iq_analysis_events"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_tags_name_key" ON "vision_iq_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vision_iq_image_embeddings_imageId_key" ON "vision_iq_image_embeddings"("imageId");

-- CreateIndex
CREATE INDEX "vision_iq_image_embeddings_imageId_idx" ON "vision_iq_image_embeddings"("imageId");

-- AddForeignKey
ALTER TABLE "vision_iq_visual_intent_requests" ADD CONSTRAINT "vision_iq_visual_intent_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "vision_iq_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_scene_intents" ADD CONSTRAINT "vision_iq_scene_intents_visualIntentRequestId_fkey" FOREIGN KEY ("visualIntentRequestId") REFERENCES "vision_iq_visual_intent_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_visual_descriptions" ADD CONSTRAINT "vision_iq_visual_descriptions_sceneIntentId_fkey" FOREIGN KEY ("sceneIntentId") REFERENCES "vision_iq_scene_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_visual_description_keywords" ADD CONSTRAINT "vision_iq_visual_description_keywords_visualDescriptionId_fkey" FOREIGN KEY ("visualDescriptionId") REFERENCES "vision_iq_visual_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_sync_history" ADD CONSTRAINT "vision_iq_pexels_sync_history_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "vision_iq_visual_description_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_pexels_images" ADD CONSTRAINT "vision_iq_pexels_images_syncHistoryId_fkey" FOREIGN KEY ("syncHistoryId") REFERENCES "vision_iq_pexels_sync_history"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_image_analysis_jobs" ADD CONSTRAINT "vision_iq_image_analysis_jobs_pexelsImageId_fkey" FOREIGN KEY ("pexelsImageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_deepseek_analysis" ADD CONSTRAINT "vision_iq_deepseek_analysis_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "vision_iq_image_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_api_logs" ADD CONSTRAINT "vision_iq_api_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vision_iq_image_analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_analysis_events" ADD CONSTRAINT "vision_iq_analysis_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "vision_iq_image_analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_description_tag_map" ADD CONSTRAINT "vision_iq_description_tag_map_descriptionId_fkey" FOREIGN KEY ("descriptionId") REFERENCES "vision_iq_visual_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_description_tag_map" ADD CONSTRAINT "vision_iq_description_tag_map_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "vision_iq_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_iq_image_embeddings" ADD CONSTRAINT "vision_iq_image_embeddings_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "vision_iq_pexels_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
