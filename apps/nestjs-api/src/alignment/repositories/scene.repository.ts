import { Injectable, Inject } from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { PRISMA_SERVICE } from "../../prisma/prisma.module";
import { PipelineStatus } from "@repo/database";

@Injectable()
export class SceneRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async createScenes(scenes: any[]) {
    return this.prisma.$transaction(
      scenes.map((scene) =>
        this.prisma.sceneIntent.create({
          data: scene,
        }),
      ),
    );
  }

  async findSceneById(id: string) {
    return this.prisma.sceneIntent.findUnique({
      where: { id },
      include: {
        descriptions: {
          include: {
            keywords: true,
          },
        },
      },
    });
  }

  async updateSceneStatus(
    id: string,
    status: PipelineStatus,
    errorMessage?: string,
  ) {
    return this.prisma.sceneIntent.update({
      where: { id },
      data: {
        status,
        errorMessage,
      },
    });
  }

  async createDescription(data: {
    sceneIntentId: string;
    description: string;
    status: PipelineStatus;
    keywords?: string[];
  }) {
    return this.prisma.visualDescription.create({
      data: {
        sceneIntentId: data.sceneIntentId,
        description: data.description,
        status: data.status,
        keywords: {
          create: data.keywords?.map((k) => ({ keyword: k })) || [],
        },
      },
    });
  }

  async findDescriptionWithUnusedKeywords() {
    return this.prisma.visualDescription.findMany({
      where: {
        keywords: {
          some: {
            isUsed: false,
          },
        },
      },
      select: {
        id: true,
      },
    });
  }

  async updateKeywordUsed(id: string, isUsed: boolean) {
    return this.prisma.visualDescriptionKeyword.update({
      where: { id },
      data: { isUsed },
    });
  }

  async findDescriptionById(id: string) {
    return this.prisma.visualDescription.findUnique({
      where: { id },
      include: {
        keywords: {
          where: { isUsed: false },
        },
      },
    });
  }

  async findPendingAnalysisJobs(limit: number) {
    return this.prisma.imageAnalysisJob.findMany({
      where: {
        jobStatus: "COMPLETED",
        deepseekAnalysis: null,
        rawApiResponse: { not: null },
        retryCount: { lt: 5 },
      },
      select: { id: true, pexelsImageId: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  async updateAnalysisJobRetry(id: string, errorMessage: string) {
    return this.prisma.imageAnalysisJob.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
        errorMessage: errorMessage,
      },
    });
  }
}
