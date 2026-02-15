import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { VisualIntentService } from "./visual-intent.service";
import { VisualIntentRepository } from "../repositories/visual-intent.repository";
import { SceneRepository } from "../repositories/scene.repository";
import { GeminiAnalysisService } from "../../image-analysis/gemini-analysis.service";
import { DeepSeekService } from "../../deepseek-integration/deepseek.service";
import { KeywordSyncService } from "./keyword-sync.service";

describe("VisualIntentService", () => {
  let service: VisualIntentService;
  let visualIntentRepo: jest.Mocked<VisualIntentRepository>;
  let deepseekService: jest.Mocked<DeepSeekService>;
  let sceneRepo: jest.Mocked<SceneRepository>;
  let keywordSyncService: jest.Mocked<KeywordSyncService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisualIntentService,
        {
          provide: VisualIntentRepository,
          useValue: {
            createRequest: jest.fn(),
            updateRequestStatus: jest.fn(),
          },
        },
        {
          provide: SceneRepository,
          useValue: {
            createScenes: jest.fn(),
            createDescription: jest.fn(),
            updateDescriptionStatus: jest.fn(),
            updateSceneStatus: jest.fn(),
          },
        },
        {
          provide: GeminiAnalysisService,
          useValue: {
            analyzeImage: jest.fn(),
          },
        },
        {
          provide: DeepSeekService,
          useValue: {
            extractVisualIntent: jest.fn(),
            expandSceneIntent: jest.fn(),
          },
        },
        {
          provide: KeywordSyncService,
          useValue: {
            syncPexelsByDescriptionId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<VisualIntentService>(VisualIntentService);
    visualIntentRepo = module.get(VisualIntentRepository) as any;
    deepseekService = module.get(DeepSeekService) as any;
    sceneRepo = module.get(SceneRepository) as any;
    keywordSyncService = module.get(KeywordSyncService) as any;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("extractVisualIntent", () => {
    it("should extract intents and trigger expansion", async () => {
      const mockRequest = { id: "req-1" };
      visualIntentRepo.createRequest.mockResolvedValue(mockRequest as any);

      const mockScenes = [{ intent: "test intent", requiredImpact: 5 }];
      deepseekService.extractVisualIntent.mockResolvedValue(mockScenes as any);

      const mockCreatedScenes = [{ id: "scene-1", intent: "test intent" }];
      sceneRepo.createScenes.mockResolvedValue(mockCreatedScenes as any);

      // Mock expansion call
      jest.spyOn(service, "expandAndSyncScene").mockResolvedValue(undefined);

      await service.extractVisualIntent({
        rawGeminiText: "test",
        autoMatch: false,
      });

      expect(visualIntentRepo.createRequest).toHaveBeenCalled();
      expect(deepseekService.extractVisualIntent).toHaveBeenCalled();
      expect(sceneRepo.createScenes).toHaveBeenCalled();
      expect(service.expandAndSyncScene).toHaveBeenCalledWith(
        "scene-1",
        "test intent",
        false,
      );
    });
  });

  describe("expandAndSyncScene", () => {
    it("should expand intent and create descriptions", async () => {
      const mockExpanded = [
        { description: "expanded 1", analysis: { keywords: ["k1", "k2"] } },
        { description: "expanded 2", analysis: { keywords: ["k3"] } },
      ];
      deepseekService.expandSceneIntent.mockResolvedValue(mockExpanded as any);

      const mockDescription = { id: "desc-1" };
      sceneRepo.createDescription.mockResolvedValue(mockDescription as any);

      await service.expandAndSyncScene("scene-1", "original intent", false);

      expect(deepseekService.expandSceneIntent).toHaveBeenCalledWith(
        "original intent",
      );
      expect(sceneRepo.createDescription).toHaveBeenCalledTimes(2);
      expect(sceneRepo.updateDescriptionStatus).toHaveBeenCalledTimes(2); // Should mark as COMPLETED when autoMatch is false
      expect(sceneRepo.updateSceneStatus).toHaveBeenCalledWith(
        "scene-1",
        "COMPLETED",
      );
      expect(
        keywordSyncService.syncPexelsByDescriptionId,
      ).not.toHaveBeenCalled();
    });

    it("should trigger auto-sync when autoMatch is true", async () => {
      const mockExpanded = [
        { description: "expanded 1", analysis: { keywords: ["k1"] } },
      ];
      deepseekService.expandSceneIntent.mockResolvedValue(mockExpanded as any);

      const mockDescription = { id: "desc-1" };
      sceneRepo.createDescription.mockResolvedValue(mockDescription as any);
      keywordSyncService.syncPexelsByDescriptionId.mockResolvedValue({} as any);

      await service.expandAndSyncScene("scene-1", "original intent", true);

      expect(keywordSyncService.syncPexelsByDescriptionId).toHaveBeenCalledWith(
        "desc-1",
      );
      expect(sceneRepo.updateDescriptionStatus).not.toHaveBeenCalled(); // status updated by individual sync result usually or remains PROCESSING
      expect(sceneRepo.updateSceneStatus).toHaveBeenCalledWith(
        "scene-1",
        "COMPLETED",
      );
    });
  });
});
