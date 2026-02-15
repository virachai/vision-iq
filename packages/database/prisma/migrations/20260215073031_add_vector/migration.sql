/*
  Warnings:

  - Changed the type of `embedding` on the `vision_iq_image_embeddings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "vision_iq_image_embeddings" DROP COLUMN "embedding",
ADD COLUMN     "embedding" vector(768) NOT NULL;
