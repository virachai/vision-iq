import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import type { PrismaClient } from "@repo/database";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { QueueService } from "../queue/queue.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { AlignmentService } from "./alignment.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";
import type { ImageMatch, SceneIntentDto } from "./dto/scene-intent.dto";

describe("AlignmentService", () => {
  let service: AlignmentService;
  let deepSeekService: DeepSeekService;
  let semanticMatchingService: SemanticMatchingService;
  let _pexelsSyncService: PexelsSyncService;
  let _queueService: QueueService;
  let _geminiAnalysisService: GeminiAnalysisService;
  let prismaClient: PrismaClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        {
          provide: DeepSeekService,
          useValue: {
            extractVisualIntent: jest.fn(),
            expandSceneIntent: jest
              .fn<() => Promise<SceneIntentDto[]>>()
              .mockResolvedValue([]),
          },
        },
        {
          provide: SemanticMatchingService,
          useValue: {
            findAlignedImages: jest.fn(),
          },
        },
        {
          provide: PexelsSyncService,
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
          provide: GeminiAnalysisService,
          useValue: {
            analyzeImage: jest.fn(),
          },
        },
        {
          provide: PRISMA_SERVICE,
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
            visualIntentRequest: {
              create: (jest.fn() as any).mockResolvedValue({ id: "req-1" }),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            sceneIntent: {
              create: (jest.fn() as any).mockResolvedValue({
                id: "scene-1",
                intent: "mock-intent",
              }),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            visualDescription: {
              create: (jest.fn() as any).mockResolvedValue({ id: "desc-1" }),
              findUnique: jest.fn(),
              findMany: (jest.fn() as any).mockResolvedValue([]),
              update: jest.fn(),
            },
            visualDescriptionKeyword: {
              findMany: (jest.fn() as any).mockResolvedValue([]),
              update: jest.fn(),
            },
          } as any,
        },
      ],
    }).compile();

    service = module.get<AlignmentService>(AlignmentService);
    deepSeekService = module.get<DeepSeekService>(DeepSeekService);
    semanticMatchingService = module.get<SemanticMatchingService>(
      SemanticMatchingService,
    );
    _pexelsSyncService = module.get<PexelsSyncService>(PexelsSyncService);
    _queueService = module.get<QueueService>(QueueService);
    _geminiAnalysisService = module.get<GeminiAnalysisService>(
      GeminiAnalysisService,
    );
    prismaClient = module.get<PrismaClient>(PRISMA_SERVICE);
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
            balance: "symmetrical",
            subject_dominance: "moderate",
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
            balance: "asymmetrical",
            subject_dominance: "strong",
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
        .mockResolvedValue(mockMatches as unknown as ImageMatch[][]);

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
