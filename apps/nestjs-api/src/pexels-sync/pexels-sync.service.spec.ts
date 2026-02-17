import { Test, TestingModule } from "@nestjs/testing";
import { PexelsSyncService } from "./pexels-sync.service";
import { PexelsIntegrationService } from "./pexels-integration.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { QueueService } from "../queue/queue.service";
import { Logger } from "@nestjs/common";

describe("PexelsSyncService (Skip Logic)", () => {
  let service: PexelsSyncService;
  let prisma: any;

  const mockPrisma = {
    pexelsSyncHistory: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    visualDescriptionKeyword: {
      update: jest.fn(),
    },
  };

  const mockPexelsIntegration = {
    syncPexelsLibrary: jest.fn(),
  };

  const mockQueueService = {
    queueImageAnalysis: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PexelsSyncService,
        { provide: PexelsIntegrationService, useValue: mockPexelsIntegration },
        { provide: QueueService, useValue: mockQueueService },
        { provide: PRISMA_SERVICE, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PexelsSyncService>(PexelsSyncService);
    prisma = module.get(PRISMA_SERVICE);

    // Silence logger
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should skip sync if a 429 error was found in the last hour", async () => {
    const recentError = {
      id: "history-123",
      errorMessage: "Request failed with status code 429",
      updatedAt: new Date(),
    };

    prisma.pexelsSyncHistory.findFirst.mockResolvedValue(recentError);

    const result = await service.syncPexelsLibrary("test");

    expect(result.status).toBe("failed");
    expect(result.errors?.[0]).toContain("Skipped due to recent 429 error");
    expect(mockPexelsIntegration.syncPexelsLibrary).not.toHaveBeenCalled();
  });

  it("should NOT skip sync if 429 error is older than 1 hour", async () => {
    prisma.pexelsSyncHistory.findFirst.mockResolvedValue(null);
    mockPexelsIntegration.syncPexelsLibrary.mockImplementation(
      async function* () {
        yield { images: [], batch_number: 1, total_batches: 1 };
      },
    );

    const result = await service.syncPexelsLibrary("test");

    expect(prisma.pexelsSyncHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          errorMessage: { contains: "429" },
          updatedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
    expect(result.status).toBe("queued");
  });
});
