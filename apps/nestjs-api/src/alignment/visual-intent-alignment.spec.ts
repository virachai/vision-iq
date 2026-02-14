import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { AlignmentService } from "./alignment.service";
import { VisualIntentService } from "./services/visual-intent.service";
import { SceneAlignmentService } from "./services/scene-alignment.service";
import { KeywordSyncService } from "./services/keyword-sync.service";
import { RefinementService } from "./services/refinement.service";
import { VisualIntentRepository } from "./repositories/visual-intent.repository";
import { SceneRepository } from "./repositories/scene.repository";

describe("Visual Intent Alignment (System Verification)", () => {
  let alignmentService: AlignmentService;
  let visualIntentService: jest.Mocked<VisualIntentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        {
          provide: VisualIntentService,
          useValue: {
            extractVisualIntent: jest.fn(),
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
          },
        },
        {
          provide: RefinementService,
          useValue: {
            processPendingDeepSeekAnalysis: jest.fn(),
          },
        },
        {
          provide: VisualIntentRepository,
          useValue: {
            getStats: jest.fn(),
            incrementRequestRetryCount: jest.fn(),
            updateRequestStatus: jest.fn(),
          },
        },
        {
          provide: SceneRepository,
          useValue: {
            createScenes: jest.fn(),
            updateSceneStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    alignmentService = module.get<AlignmentService>(AlignmentService);
    visualIntentService = module.get(VisualIntentService) as any;
  });

  it("should extract visual intent correctly (delegation test)", async () => {
    const mockRawText = "A narrative description...";
    const mockScenes = [
      {
        intent: "A person feeling overwhelmed by laundry",
        requiredImpact: 8,
        preferredComposition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
        },
        visualIntent: {
          emotional_layer: {
            intent_words: ["overwhelmed"],
            vibe: "oppressive",
          },
        },
      },
    ];

    visualIntentService.extractVisualIntent.mockResolvedValue(
      mockScenes as any,
    );

    const result = await alignmentService.extractVisualIntent({
      rawGeminiText: mockRawText,
      autoMatch: false,
    });

    expect(result).toHaveLength(1);
    expect(visualIntentService.extractVisualIntent).toHaveBeenCalled();
  });
});
