import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@repo/database";
import { Queue, Worker } from "bullmq";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { QueueService } from "./queue.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";

// Mock BullMQ
jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});

describe("QueueService", () => {
  let service: QueueService;
  let mockPrisma: any;
  let mockGemini: any;
  let mockPexels: any;

  beforeEach(async () => {
    mockPrisma = {
      imageMetadata: { upsert: jest.fn() },
      imageAnalysisJob: { upsert: jest.fn() },
      pexelsImage: { findUnique: jest.fn() },
    };
    mockGemini = { analyzeImage: jest.fn() };
    mockPexels = { syncPexelsLibrary: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: GeminiAnalysisService, useValue: mockGemini },
        { provide: PexelsSyncService, useValue: mockPexels },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("processImageAnalysis", () => {
    it("should return early if image does not exist", async () => {
      mockPrisma.pexelsImage.findUnique.mockResolvedValue(null);

      // Access private method
      await (service as any).processImageAnalysis({
        imageId: "img-1",
        pexelsId: "p-1",
        imageUrl: "url",
      });

      expect(mockGemini.analyzeImage).not.toHaveBeenCalled();
    });
  });
});
