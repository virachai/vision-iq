import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@repo/database";
import { AlignmentService } from "./alignment.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { QueueService } from "../queue/queue.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";

describe("AlignmentService Sync", () => {
  let service: AlignmentService;
  let mockPrisma: any;
  let mockPexelsSync: any;

  beforeEach(async () => {
    mockPrisma = {
      visualDescription: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      visualDescriptionKeyword: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) =>
        typeof cb === "function" ? cb(mockPrisma) : Promise.resolve(cb),
      ),
      logger: {
        log: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      },
    };

    mockPexelsSync = {
      syncPexelsLibrary: jest
        .fn()
        .mockResolvedValue({ status: "completed", job_ids: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        { provide: PRISMA_SERVICE, useValue: mockPrisma },
        { provide: PexelsSyncService, useValue: mockPexelsSync },
        { provide: DeepSeekService, useValue: {} },
        { provide: SemanticMatchingService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: GeminiAnalysisService, useValue: {} },
      ],
    }).compile();

    service = module.get<AlignmentService>(AlignmentService);
  });

  it("should sync pexels for unused keywords", async () => {
    const descriptionId = "desc-123";
    const description = {
      id: descriptionId,
      description: "test description",
      analysis: { keywords: ["nature", "forest"] },
    };

    mockPrisma.visualDescription.findMany.mockResolvedValue([
      { id: descriptionId },
    ]);
    mockPrisma.visualDescription.findUnique.mockResolvedValue(description);

    const result = await service.autoSyncUnusedKeywords();

    expect(result.processed).toBe(1);
    expect(mockPexelsSync.syncPexelsLibrary).toHaveBeenCalledWith(
      "nature forest",
      1000,
      0.1,
      descriptionId,
    );
    expect(mockPrisma.visualDescriptionKeyword.updateMany).toHaveBeenCalledWith(
      {
        where: { descriptionId },
        data: { isUsed: true },
      },
    );
  });

  it("should handle no unused keywords", async () => {
    mockPrisma.visualDescription.findMany.mockResolvedValue([]);

    const result = await service.autoSyncUnusedKeywords();

    expect(result.processed).toBe(0);
    expect(mockPexelsSync.syncPexelsLibrary).not.toHaveBeenCalled();
  });
});
