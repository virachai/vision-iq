import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import axios from "axios";
import { DeepSeekService } from "./deepseek.service";

jest.mock("axios");

describe("DeepSeekService", () => {
  let service: DeepSeekService;

  beforeEach(async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeepSeekService],
    }).compile();

    service = module.get<DeepSeekService>(DeepSeekService);
  });

  describe("extractVisualIntent", () => {
    it("should extract scene intents from raw text", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    intent: "A lone figure in a field",
                    required_impact: 8,
                    preferred_composition: {
                      negative_space: "left",
                      shot_type: "WS",
                      angle: "eye",
                    },
                  },
                ]),
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.extractVisualIntent(
        "A man stands alone in a vast field at sunset",
      );

      expect(result).toHaveLength(1);
      expect(result[0].intent).toBe("A lone figure in a field");
      expect(result[0].required_impact).toBe(8);
    });

    it("should handle JSON in markdown code blocks", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content:
                  '```json\n[{\n  "intent": "Sunset scene",\n  "required_impact": 7,\n  "preferred_composition": {\n    "negative_space": "center",\n    "shot_type": "WS",\n    "angle": "low"\n  }\n}]\n```',
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.extractVisualIntent("A sunset scene");

      expect(result).toHaveLength(1);
      expect(result[0].intent).toBe("Sunset scene");
    });

    it("should normalize impact scores to 1-10 range", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    intent: "Test",
                    required_impact: 15,
                    preferred_composition: {
                      negative_space: "left",
                      shot_type: "WS",
                      angle: "eye",
                    },
                  },
                ]),
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.extractVisualIntent("Test");

      expect(result[0].required_impact).toBe(10);
    });

    it("should validate composition values", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    intent: "Test",
                    required_impact: 5,
                    preferred_composition: {
                      negative_space: "invalid",
                      shot_type: "invalid",
                      angle: "invalid",
                    },
                  },
                ]),
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.extractVisualIntent("Test");

      expect(result[0].preferred_composition.negative_space).toBe("center");
      expect(result[0].preferred_composition.shot_type).toBe("MS");
      expect(result[0].preferred_composition.angle).toBe("eye");
    });

    it("should retry on rate limiting (429)", async () => {
      const error = new Error("Rate limited");
      // biome-ignore lint/suspicious/noExplicitAny: Mocking error response
      (error as any).response = { status: 429 };

      (axios.post as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: {
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      intent: "Success",
                      required_impact: 5,
                      preferred_composition: {
                        negative_space: "center",
                        shot_type: "MS",
                        angle: "eye",
                      },
                    },
                  ]),
                },
              },
            ],
          },
        });

      const result = await service.extractVisualIntent("Test");

      expect(result).toHaveLength(1);
      expect(result[0].intent).toBe("Success");
    });

    it("should throw error on invalid JSON response", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "This is not valid JSON {]",
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      await expect(service.extractVisualIntent("Test")).rejects.toThrow(
        "Invalid JSON response from DeepSeek",
      );
    });
  });

  describe("analyzeDetailedVisualIntent", () => {
    it("should extract 7 layers of visual intent from rich description", async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  coreIntent: {
                    intent: "loneliness",
                    visual_goal: "feel isolation",
                  },
                  spatialStrategy: {
                    shot_type: "WS",
                    negative_space: "vast",
                    balance: "asymmetrical",
                  },
                  subjectTreatment: {
                    identity: "concealed",
                    dominance: "submissive",
                    eye_contact: "none",
                  },
                  colorPsychology: {
                    palette: ["blue", "grey"],
                    contrast: "low",
                    mood: "melancholy",
                  },
                  emotionalArchitecture: {
                    vibe: "still",
                    rhythm: "static",
                    intensity: "low",
                  },
                  metaphoricalLayer: {
                    objects: ["empty bench=lost rest"],
                    meaning: "waiting for nothing",
                  },
                  cinematicLeverage: {
                    angle: "high",
                    lighting: "flat",
                    sound: "wind whistle",
                  },
                }),
              },
            },
          ],
        },
      };

      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.analyzeDetailedVisualIntent(
        "A lone figure sits on a bench in a foggy park.",
      );

      expect(result.coreIntent.intent).toBe("loneliness");
      expect(result.spatialStrategy.shot_type).toBe("WS");
      expect(result.subjectTreatment.identity).toBe("concealed");
    });
  });
});
