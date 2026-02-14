-- AlterTable
ALTER TABLE "vision_iq_image_embeddings" ADD COLUMN     "embedding" DOUBLE PRECISION[];

-- CreateTable
CREATE TABLE "ping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ping_pkey" PRIMARY KEY ("id")
);
