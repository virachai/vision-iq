import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { AlignmentService } from "./alignment.service";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { SemanticMatchingService } from "../semantic-matching/semantic-matching.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { QueueService } from "../queue/queue.service";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";

describe("Visual Intent Alignment (System Verification)", () => {
  let alignmentService: AlignmentService;
  let deepseekService: DeepSeekService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlignmentService,
        {
          provide: DeepSeekService,
          useValue: {
            extractVisualIntent: jest.fn(),
            expandSceneIntent: jest.fn(),
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
            queueAutoSync: jest.fn(),
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
            visualIntentRequest: {
              create: jest.fn().mockResolvedValue({ id: "req-1" }) as any,
              update: jest.fn() as any,
            },
            sceneIntent: {
              create: jest
                .fn()
                .mockResolvedValue({ id: "scene-1", intent: "test" }) as any,
              update: jest.fn() as any,
            },
            visualDescription: {
              create: jest.fn().mockResolvedValue({ id: "desc-1" }) as any,
              update: jest.fn() as any,
            },
            visualDescriptionKeyword: {
              findMany: jest.fn().mockResolvedValue([]) as any,
            },
          },
        },
      ],
    }).compile();

    alignmentService = module.get<AlignmentService>(AlignmentService);
    deepseekService = module.get<DeepSeekService>(DeepSeekService);
  });

  it("should extract 4-layer visual intent correctly", async () => {
    const mockRawText = "A narrative description...";
    const mockScenes = [
      {
        intent: "A person feeling overwhelmed by laundry",
        required_impact: 8,
        preferred_composition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
        },
        visual_intent: {
          emotional_layer: {
            intent_words: ["overwhelmed", "suffocation"],
            vibe: "oppressive",
          },
          spatial_strategy: {
            strategy_words: ["cluttered frame"],
            shot_type: "MS",
            balance: "asymmetrical",
          },
          subject_treatment: {
            treatment_words: ["hidden face"],
            identity: "concealed",
            dominance: "overwhelmed",
          },
          color_mapping: {
            temperature_words: ["harsh light"],
            temperature: "cold",
            contrast: "high",
          },
        },
      },
    ];

    (deepseekService.extractVisualIntent as any).mockResolvedValue(mockScenes);
    (deepseekService.expandSceneIntent as any).mockResolvedValue([]);

    const result = await alignmentService.extractVisualIntent({
      raw_gemini_text: mockRawText,
      auto_match: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0].visual_intent).toBeDefined();
    expect(result[0].visual_intent?.emotional_layer?.intent_words).toContain(
      "overwhelmed",
    );
    expect(result[0].visual_intent?.color_mapping?.temperature).toBe("cold");
  });

  it("should generate the structured search formula correctly", async () => {
    const scene = {
      intent: "A person feeling overwhelmed",
      visual_intent: {
        emotional_layer: { intent_words: ["overwhelmed"], vibe: "oppressive" },
        spatial_strategy: {
          strategy_words: ["cluttered frame"],
          shot_type: "MS",
          balance: "asymmetrical",
        },
        subject_treatment: {
          treatment_words: ["hidden face"],
          identity: "concealed",
          dominance: "overwhelmed",
        },
        color_mapping: {
          temperature_words: ["harsh light"],
          temperature: "cold",
          contrast: "high",
        },
      },
    };

    // Accessing private method for testing purpose
    const formula = (alignmentService as any).generateStructuredSearchFormula(
      scene,
    );

    expect(formula).toContain("CORE_INTENT: overwhelmed");
    expect(formula).toContain("SPATIAL_STRATEGY: cluttered frame");
    expect(formula).toContain("COLOR_PROFILE: harsh light");
    expect(formula).toContain(
      "KEYWORD_STRING: A person feeling overwhelmed, cluttered frame, overwhelmed, harsh light",
    );
  });
});
