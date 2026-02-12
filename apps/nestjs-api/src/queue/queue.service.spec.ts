import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient } from "@repo/database";
import { Queue, Worker } from "bullmq";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { QueueService } from "./queue.service";

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

// Mock Prisma
const mockPrismaClient = {
	imageMetadata: {
		upsert: jest.fn(),
	},
	imageAnalysisJob: {
		update: jest.fn(),
	},
	imageEmbedding: {
		upsert: jest.fn(),
	},
};

// Mock GeminiAnalysisService
const mockGeminiAnalysisService = {
	analyzeImage: jest.fn(),
};

describe("QueueService", () => {
	let service: QueueService;

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				QueueService,
				{ provide: PrismaClient, useValue: mockPrismaClient },
				{ provide: GeminiAnalysisService, useValue: mockGeminiAnalysisService },
			],
		}).compile();

		service = module.get<QueueService>(QueueService);
	});

	describe("onModuleInit", () => {
		it("should initialize queues and workers", async () => {
			await service.onModuleInit();
			expect(Queue).toHaveBeenCalledTimes(2);
			expect(Worker).toHaveBeenCalledTimes(2);
		});
	});

	describe("queueImageAnalysis", () => {
		it("should add job to image-analysis queue", async () => {
			await service.onModuleInit(); // Initialize queues first

			// biome-ignore lint/suspicious/noExplicitAny: Accessing private property for testing
			const mockQueue = (service as any).imageAnalysisQueue;
			mockQueue.add.mockResolvedValue({ id: "job-123" });

			const jobId = await service.queueImageAnalysis(
				"img-1",
				"http://url",
				"pexels-1",
			);

			expect(mockQueue.add).toHaveBeenCalledWith(
				"analyze",
				{ imageId: "img-1", imageUrl: "http://url", pexelsId: "pexels-1" },
				expect.any(Object),
			);
			expect(jobId).toBe("job-123");
		});
	});

	describe("processImageAnalysis", () => {
		const jobData = {
			imageId: "img-1",
			imageUrl: "http://url",
			pexelsId: "pexels-1",
		};

		it("should process analysis and update prisma", async () => {
			// Access private method
			// biome-ignore lint/suspicious/noExplicitAny: Accessing private method for testing
			const processImageAnalysis = (service as any).processImageAnalysis.bind(
				service,
			);

			// Mock queueEmbeddingGeneration (it's called at end of processing)
			service.queueEmbeddingGeneration = jest.fn();

			mockGeminiAnalysisService.analyzeImage.mockResolvedValue({
				impact_score: 10,
			});

			await processImageAnalysis(jobData);

			expect(mockGeminiAnalysisService.analyzeImage).toHaveBeenCalledWith(
				"http://url",
			);
			expect(mockPrismaClient.imageMetadata.upsert).toHaveBeenCalled();
			expect(mockPrismaClient.imageAnalysisJob.update).toHaveBeenCalledWith({
				where: { imageId: "img-1" },
				data: { status: "COMPLETED", result: { impact_score: 10 } },
			});
			expect(service.queueEmbeddingGeneration).toHaveBeenCalled();
		});

		it("should handle failure and update prisma", async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Accessing private method for testing
			const processImageAnalysis = (service as any).processImageAnalysis.bind(
				service,
			);

			mockGeminiAnalysisService.analyzeImage.mockRejectedValue(
				new Error("Analysis failed"),
			);

			await expect(processImageAnalysis(jobData)).rejects.toThrow(
				"Analysis failed",
			);

			expect(mockPrismaClient.imageAnalysisJob.update).toHaveBeenCalledWith({
				where: { imageId: "img-1" },
				data: expect.objectContaining({
					status: "FAILED",
					errorMessage: "Analysis failed",
				}),
			});
		});
	});
});
