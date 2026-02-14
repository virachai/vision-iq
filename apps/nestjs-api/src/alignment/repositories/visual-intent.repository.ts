import { Injectable, Inject } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../../prisma/prisma.module";
import { PipelineStatus } from "@repo/database";

@Injectable()
export class VisualIntentRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async createRequest(rawGeminiText: string) {
    return this.prisma.visualIntentRequest.create({
      data: {
        rawGeminiText,
        status: "PROCESSING" as PipelineStatus,
      },
    });
  }

  async findRequestById(id: string) {
    return this.prisma.visualIntentRequest.findUnique({
      where: { id },
      include: {
        scenes: true,
      },
    });
  }

  async updateRequestStatus(
    id: string,
    status: PipelineStatus,
    errorMessage?: string,
  ) {
    // Check current status before update to avoid state regression or redundant updates
    const current = await this.prisma.visualIntentRequest.findUnique({
      where: { id },
      select: { status: true },
    });

    if (current?.status === "COMPLETED") {
      return null;
    }

    return this.prisma.visualIntentRequest.update({
      where: { id },
      data: {
        status,
        errorMessage,
      },
    });
  }

  async getStats() {
    const [totalImages, totalEmbeddings, pendingJobs, failedJobs] =
      await Promise.all([
        this.prisma.pexelsImage.count(),
        this.prisma.imageEmbedding.count(),
        this.prisma.imageAnalysisJob.count({ where: { jobStatus: "QUEUED" } }),
        this.prisma.imageAnalysisJob.count({ where: { jobStatus: "FAILED" } }),
      ]);

    return {
      total_images: totalImages,
      total_embeddings: totalEmbeddings,
      pending_analysis_jobs: pendingJobs,
      failed_jobs: failedJobs,
      ready_for_search: totalEmbeddings,
    };
  }

  // Helper check for the specific model existence if needed, or just let types handle it
  isPexelsImageModelAvailable(): boolean {
    return !!this.prisma.pexelsImage;
  }

  async incrementRequestRetryCount(id: string) {
    return this.prisma.visualIntentRequest.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
      },
    });
  }
}
