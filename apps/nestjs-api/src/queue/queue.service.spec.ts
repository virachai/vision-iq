import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@repo/database";
import { Queue, Worker } from "bullmq";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { QueueService } from "./queue.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import { forwardRef } from "@nestjs/common";

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
      imageAnalysisJob: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      pexelsImage: { findUnique: jest.fn() },
    };
    mockGemini = { analyzeImage: jest.fn() };
    mockPexels = { syncPexelsLibrary: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: PRISMA_SERVICE, useValue: mockPrisma },
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

  describe("requeueFallbackJobs", () => {
    it("should find and re-queue fallback jobs", async () => {
      const mockJobs = [
        {
          id: "job-1",
          pexelsImageId: "img-1",
          pexelsImage: {
            url: "url-1",
            pexelsImageId: "p-1",
            alt: "alt-1",
          },
        },
      ];

      mockPrisma.imageAnalysisJob.findMany.mockResolvedValue(mockJobs);
      mockPrisma.imageAnalysisJob.update.mockResolvedValue({});

      // Mock queueImageAnalysis or wait for completion
      const queueSpy = jest
        .spyOn(service, "queueImageAnalysis")
        .mockResolvedValue("job-id");

      const count = await service.requeueFallbackJobs();

      expect(count).toBe(1);
      expect(mockPrisma.imageAnalysisJob.findMany).toHaveBeenCalled();
      expect(mockPrisma.imageAnalysisJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "job-1" },
          data: expect.objectContaining({
            jobStatus: "PENDING",
            rawApiResponse: null,
          }),
        }),
      );
      expect(queueSpy).toHaveBeenCalledWith("img-1", "url-1", "p-1", "alt-1");
    });

    it("should return 0 if no fallback jobs found", async () => {
      mockPrisma.imageAnalysisJob.findMany.mockResolvedValue([]);

      const count = await service.requeueFallbackJobs();

      expect(count).toBe(0);
      expect(mockPrisma.imageAnalysisJob.findMany).toHaveBeenCalled();
    });
  });
});
