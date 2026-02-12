import { Test, TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { AlignmentService } from "./alignment.service";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PexelsIntegrationService } from "../pexels-sync/pexels-integration.service";
import { QueueService } from "../queue/queue.service";
import { PrismaClient } from "@repo/database";
import { SceneIntentDto } from "./dto/scene-intent.dto";

describe("AlignmentService", () => {
  let service: AlignmentService;
  let deepSeekService: DeepSeekService;
  let semanticMatchingService: SemanticMatchingService;
  let pexelsIntegrationService: PexelsIntegrationService;
  let queueService: QueueService;
  let prismaClient: PrismaClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        {
          provide: DeepSeekService,
          useValue: {
            extractVisualIntent: jest.fn(),
          },
        },
        {
          provide: SemanticMatchingService,
          useValue: {
            findAlignedImages: jest.fn(),
          },
        },
        {
          provide: PexelsIntegrationService,
          useValue: {
            syncPexelsLibrary: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            queueImageAnalysis: jest.fn(),
          },
        },
        {
          provide: PrismaClient,
          useValue: {
            pexelsImage: {
              upsert: jest.fn(),
              count: jest.fn(),
            },
            imageAnalysisJob: {
              create: jest.fn(),
              count: jest.fn(),
            },
            imageEmbedding: {
              count: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AlignmentService>(AlignmentService);
    deepSeekService = module.get<DeepSeekService>(DeepSeekService);
    semanticMatchingService = module.get<SemanticMatchingService>(
      SemanticMatchingService,
    );
    pexelsIntegrationService = module.get<PexelsIntegrationService>(
      PexelsIntegrationService,
    );
    queueService = module.get<QueueService>(QueueService);
    prismaClient = module.get<PrismaClient>(PrismaClient);
  });

  describe("extractVisualIntent", () => {
    it("should extract scene intents from raw Gemini text", async () => {
      const mockScenes: SceneIntentDto[] = [
        {
          intent: "A lone figure standing in an empty field",
          required_impact: 8,
          preferred_composition: {
            negative_space: "left",
            shot_type: "WS",
            angle: "eye",
          },
        },
      ];

      jest
        .spyOn(deepSeekService, "extractVisualIntent")
        .mockResolvedValue(mockScenes);

      const result = await service.extractVisualIntent({
        raw_gemini_text: "A man stands alone in a vast cornfield at sunset",
      });

      expect(result).toEqual(mockScenes);
      expect(deepSeekService.extractVisualIntent).toHaveBeenCalled();
    });

    it("should throw error if no scenes extracted", async () => {
      jest.spyOn(deepSeekService, "extractVisualIntent").mockResolvedValue([]);

      await expect(
        service.extractVisualIntent({ raw_gemini_text: "Some text" }),
      ).rejects.toThrow("DeepSeek returned no valid scenes");
    });
  });

  describe("findAlignedImages", () => {
    it("should find aligned images for scenes", async () => {
      const mockScenes: SceneIntentDto[] = [
        {
          intent: "A lone figure",
          required_impact: 8,
          preferred_composition: {
            negative_space: "left",
            shot_type: "WS",
            angle: "eye",
          },
        },
      ];

      const mockMatches = [
        [
          {
            image_id: "img-1",
            pexels_id: "pexels-123",
            url: "https://example.com/image.jpg",
            match_score: 0.92,
            vector_similarity: 0.85,
            impact_relevance: 0.9,
            composition_match: 0.8,
            mood_consistency_score: 1.0,
            metadata: {},
          },
        ],
      ];

      jest
        .spyOn(semanticMatchingService, "findAlignedImages")
        .mockResolvedValue(mockMatches as any);

      const result = await service.findAlignedImages({
        scenes: mockScenes,
        top_k: 5,
      });

      expect(result).toEqual(mockMatches);
      expect(semanticMatchingService.findAlignedImages).toHaveBeenCalled();
    });

    it("should throw error if no scenes provided", async () => {
      await expect(service.findAlignedImages({ scenes: [] })).rejects.toThrow(
        "No scenes provided",
      );
    });
  });

  describe("getStats", () => {
    it("should return database statistics", async () => {
      jest.spyOn(prismaClient.pexelsImage, "count").mockResolvedValue(1000);
      jest.spyOn(prismaClient.imageEmbedding, "count").mockResolvedValue(950);
      jest.spyOn(prismaClient.imageAnalysisJob, "count").mockResolvedValue(50);

      const result = await service.getStats();

      expect(result.total_images).toBe(1000);
      expect(result.total_embeddings).toBe(950);
      expect(result.pending_analysis_jobs).toBe(50);
    });
  });
});
