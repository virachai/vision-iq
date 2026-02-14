import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import { VisualIntentService } from "./visual-intent.service";
import { VisualIntentRepository } from "../repositories/visual-intent.repository";
import { SceneRepository } from "../repositories/scene.repository";
import { GeminiAnalysisService } from "../../image-analysis/gemini-analysis.service";
import { DeepSeekService } from "../../deepseek-integration/deepseek.service";

describe("VisualIntentService", () => {
  let service: VisualIntentService;
  let visualIntentRepo: jest.Mocked<VisualIntentRepository>;
  let deepseekService: jest.Mocked<DeepSeekService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisualIntentService,
        {
          provide: VisualIntentRepository,
          useValue: {
            createRequest: jest.fn(),
            updateStatus: jest.fn(),
          },
        },
        {
          provide: SceneRepository,
          useValue: {
            createScene: jest.fn(),
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
          },
        },
      ],
    }).compile();

    service = module.get<VisualIntentService>(VisualIntentService);
    visualIntentRepo = module.get(VisualIntentRepository) as any;
    deepseekService = module.get(DeepSeekService) as any;
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
