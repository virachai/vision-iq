import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { AlignmentService } from "./alignment.service";
import { VisualIntentService } from "./services/visual-intent.service";
import { SceneAlignmentService } from "./services/scene-alignment.service";
import { KeywordSyncService } from "./services/keyword-sync.service";
import { RefinementService } from "./services/refinement.service";
import { VisualIntentRepository } from "./repositories/visual-intent.repository";
import { SceneRepository } from "./repositories/scene.repository";
import type { ImageMatch, SceneIntentDto } from "./dto/scene-intent.dto";

describe("AlignmentService", () => {
  let service: AlignmentService;
  let visualIntentService: jest.Mocked<VisualIntentService>;
  let sceneAlignmentService: jest.Mocked<SceneAlignmentService>;
  let keywordSyncService: jest.Mocked<KeywordSyncService>;
  let refinementService: jest.Mocked<RefinementService>;
  let visualIntentRepo: jest.Mocked<VisualIntentRepository>;
  let sceneRepo: jest.Mocked<SceneRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        {
          provide: VisualIntentService,
          useValue: {
            extractVisualIntent: jest.fn(),
            testImageAnalysis: jest.fn(),
          },
        },
        {
          provide: SceneAlignmentService,
          useValue: {
            findAlignedImages: jest.fn(),
          },
        },
        {
          provide: KeywordSyncService,
          useValue: {
            syncPexelsLibrary: jest.fn(),
            syncPexelsByDescriptionId: jest.fn(),
            autoSyncUnusedKeywords: jest.fn(),
          },
        },
        {
          provide: RefinementService,
          useValue: {
            processPendingDeepSeekAnalysis: jest.fn(),
            refineAnalysis: jest.fn(),
          },
        },
        {
          provide: VisualIntentRepository,
          useValue: {
            findRequestById: jest.fn(),
            getStats: jest.fn(),
            incrementRequestRetryCount: jest.fn(),
          },
        },
        {
          provide: SceneRepository,
          useValue: {
            findSceneById: jest.fn(),
            incrementSceneRetryCount: jest.fn(),
            incrementDescriptionRetryCount: jest.fn(),
            updateSceneStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AlignmentService>(AlignmentService);
    visualIntentService = module.get(VisualIntentService) as any;
    sceneAlignmentService = module.get(SceneAlignmentService) as any;
    keywordSyncService = module.get(KeywordSyncService) as any;
    refinementService = module.get(RefinementService) as any;
    visualIntentRepo = module.get(VisualIntentRepository) as any;
    sceneRepo = module.get(SceneRepository) as any;
  });

  describe("extractVisualIntent", () => {
    it("should delegate to visualIntentService", async () => {
      const mockDto = { rawGeminiText: "test" };
      const mockResult = [{ intent: "test" }] as SceneIntentDto[];
      visualIntentService.extractVisualIntent.mockResolvedValue(mockResult);

      const result = await service.extractVisualIntent(mockDto);

      expect(result).toBe(mockResult);
      expect(visualIntentService.extractVisualIntent).toHaveBeenCalledWith(
        mockDto,
      );
    });
  });

  describe("findAlignedImages", () => {
    it("should delegate to sceneAlignmentService", async () => {
      const mockDto = { scenes: [] as any[], topK: 5 };
      const mockResult = [[{ imageId: "img1" }]] as ImageMatch[][];
      sceneAlignmentService.findAlignedImages.mockResolvedValue(mockResult);

      const result = await service.findAlignedImages(mockDto);

      expect(result).toBe(mockResult);
      expect(sceneAlignmentService.findAlignedImages).toHaveBeenCalledWith(
        mockDto,
      );
    });
  });

  describe("syncPexelsLibrary", () => {
    it("should delegate to keywordSyncService", async () => {
      await service.syncPexelsLibrary("nature", 50);
      expect(keywordSyncService.syncPexelsLibrary).toHaveBeenCalledWith(
        "nature",
        50,
        0.1,
      );
    });
  });

  describe("getStats", () => {
    it("should delegate to visualIntentRepo", async () => {
      const mockStats = { total_images: 100 } as any;
      visualIntentRepo.getStats.mockResolvedValue(mockStats);

      const result = await service.getStats();

      expect(result).toBe(mockStats);
      expect(visualIntentRepo.getStats).toHaveBeenCalled();
    });
  });

  describe("resumeProcessing", () => {
    it("should handle request resume", async () => {
      const mockId = "req-1";
      visualIntentRepo.findRequestById.mockResolvedValue({
        rawGeminiText: "test",
      } as any);

      await service.resumeProcessing("request", mockId);

      expect(visualIntentRepo.findRequestById).toHaveBeenCalledWith(mockId);
      expect(visualIntentService.extractVisualIntent).toHaveBeenCalled();
    });
  });
});
