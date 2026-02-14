import { Test, type TestingModule } from "@nestjs/testing";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { GoogleGenAI, Modality } from "@google/genai";
import { DeepSeekService } from "../deepseek-integration/deepseek.service";
import { PRISMA_SERVICE } from "../prisma/prisma.module";

jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn(),
    Modality: {
      TEXT: "TEXT",
      AUDIO: "AUDIO",
      IMAGE: "IMAGE",
    },
  };
});

describe("GeminiAnalysisService", () => {
  let service: GeminiAnalysisService;
  let mockConnect: jest.Mock;
  let mockSession: any;
  let mockDeepSeekServiceValue: any;
  let mockPrisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-api-key";
    process.env.ENABLE_GEMINI = "true";

    mockSession = {
      sendClientContent: jest.fn(),
      close: jest.fn(),
    };

    mockConnect = jest.fn().mockResolvedValue(mockSession);

    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      live: {
        connect: mockConnect,
      },
    }));

    mockPrisma = {
      pexelsImage: {
        findUnique: jest.fn(),
      },
      visualIntentAnalysis: {
        upsert: jest.fn(),
      },
      imageAnalysisJob: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deepSeekAnalysis: {
        upsert: jest.fn(),
      },
    };

    mockDeepSeekServiceValue = {
      parseGeminiRawResponse: jest.fn(),
      analyzeDetailedVisualIntent: jest.fn(),
      get isDeepSeekEnabled() {
        return true;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiAnalysisService,
        {
          provide: DeepSeekService,
          useValue: mockDeepSeekServiceValue,
        },
        {
          provide: PRISMA_SERVICE,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<GeminiAnalysisService>(GeminiAnalysisService);
  });

  describe("Feature Flag", () => {
    it("should return fallbacks when ENABLE_GEMINI is false", async () => {
      process.env.ENABLE_GEMINI = "false";
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiAnalysisService,
          { provide: DeepSeekService, useValue: mockDeepSeekServiceValue },
          { provide: PRISMA_SERVICE, useValue: mockPrisma },
        ],
      }).compile();
      const disabledService = module.get<GeminiAnalysisService>(
        GeminiAnalysisService,
      );

      const result = await disabledService.analyzeImage(
        "http://example.com/img.jpg",
      );
      expect(result.rawResponse).toBe("Gemini disabled - Fallback returned");
      expect(result.result).toBeDefined();

      const batchResult = await disabledService.analyzeImages([
        { id: "1", imageUrl: "url" },
      ]);
      expect(batchResult).toHaveLength(1);
      expect(batchResult[0].result).toBeDefined();
    });
  });

  describe("analyzeVisualIntent", () => {
    it("should successfully analyze and save visual intent using hybrid Gemini-DeepSeek flow", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      const prisma = (service as any).prisma;
      const deepseek = (service as any).deepseekService;

      prisma.pexelsImage.findUnique.mockResolvedValue({
        id: "img-123",
        url: "http://test.com/img.jpg",
      });

      const mockRichDescription = "A rich cinematic description of the image.";
      const mockResult = {
        coreIntent: { intent: "Test Intent", visual_goal: "Goal" },
        spatialStrategy: {
          shot_type: "WS",
          negative_space: "center",
          balance: "sym",
        },
        subjectTreatment: {
          identity: "hidden",
          dominance: "weak",
          eye_contact: "none",
        },
        colorPsychology: {
          palette: ["red"],
          contrast: "high",
          mood: "intense",
        },
        emotionalArchitecture: {
          vibe: "sad",
          rhythm: "slow",
          intensity: "low",
        },
        metaphoricalLayer: { objects: ["rose"], meaning: "love" },
        cinematicLeverage: {
          angle: "high",
          lighting: "dark",
          sound: "silence",
        },
      };

      deepseek.analyzeDetailedVisualIntent = jest
        .fn()
        .mockResolvedValue(mockResult);

      mockConnect.mockImplementation(({ callbacks }) => {
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: {
                parts: [{ text: mockRichDescription }],
              },
            },
          });
          callbacks.onmessage({
            serverContent: { turnComplete: true },
          });
        }, 10);
        return Promise.resolve(mockSession);
      });

      await service.analyzeVisualIntent("img-123");

      expect(prisma.pexelsImage.findUnique).toHaveBeenCalledWith({
        where: { id: "img-123" },
      });
      // Verify DeepSeek was called with the description from Gemini
      expect(deepseek.analyzeDetailedVisualIntent).toHaveBeenCalledWith(
        mockRichDescription,
      );

      expect(prisma.visualIntentAnalysis.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pexelsImageId: "img-123" },
          create: expect.objectContaining({
            coreIntent: expect.objectContaining({ intent: "Test Intent" }),
          }),
        }),
      );
    });
  });

  describe("analyzeImage", () => {
    // ... existing tests ...
    const mockRawResponse = `
IMPACT: 8
VISUAL_WEIGHT: 7

COMPOSITION:
- negative_space: right
- shot_type: WS
- angle: low
- balance: asymmetrical
- subject_dominance: strong

COLOR_PROFILE:
- temperature: warm
- primary_color: #FF5733
- secondary_colors: orange, red
- contrast_level: high

MOOD_DNA:
- vibe: energetic
- emotional_intensity: strong
- rhythm: dynamic

METAPHORICAL_FIELD:
freedom
adventure
horizon
discovery
journey

CINEMATIC_NOTES:
The wide shot emphasizes the vastness of the landscape. The low angle provides a sense of empowerment. The warm color palette creates a welcoming yet intense atmosphere that lasts for more than two hundred characters and multiple paragraphs if needed.
`;

    const expectedResult = {
      impact_score: 8,
      visual_weight: 7,
      composition: {
        negative_space: "right",
        shot_type: "WS",
        angle: "low",
        balance: "asymmetrical",
        subject_dominance: "strong",
      },
      color_profile: {
        temperature: "warm",
        primary_color: "#FF5733",
        secondary_colors: ["orange", "red"],
        contrast_level: "high",
      },
      mood_dna: {
        vibe: "energetic",
        emotional_intensity: "strong",
        rhythm: "dynamic",
        temp: "warm",
        primary_color: "#FF5733",
      },
      metaphorical_tags: [
        "freedom",
        "adventure",
        "horizon",
        "discovery",
        "journey",
      ],
      cinematic_notes:
        "The wide shot emphasizes the vastness of the landscape. The low angle provides a sense of empowerment. The warm color palette creates a welcoming yet intense atmosphere that lasts for more than two hundred characters and multiple paragraphs if needed.",
    };

    it("should successfully analyze an image via Live API with raw text validation", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      mockConnect.mockImplementation(({ callbacks }) => {
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: {
                parts: [{ text: mockRawResponse }],
              },
            },
          });
          callbacks.onmessage({
            serverContent: { turnComplete: true },
          });
        }, 10);
        return Promise.resolve(mockSession);
      });

      const { result } = await service.analyzeImage(
        "https://example.com/image.jpg",
      );

      expect(result).toEqual(expectedResult);
    });

    it("should retry if grade validation fails", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      let attempts = 0;
      mockConnect.mockImplementation(({ callbacks }) => {
        attempts++;
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: {
                // First attempt: missing sections
                parts: [
                  {
                    text:
                      attempts === 1 ? "Incomplete response" : mockRawResponse,
                  },
                ],
              },
            },
          });
          callbacks.onmessage({
            serverContent: { turnComplete: true },
          });
        }, 10);
        return Promise.resolve(mockSession);
      });

      // Mock sleep to be fast
      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      const { result } = await service.analyzeImage(
        "https://example.com/image.jpg",
        "hard",
      );

      expect(attempts).toBe(2);
      expect(result).toEqual(expectedResult);
    });

    it("should return result if all retries fail validation (fallback to none)", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      let attempts = 0;
      mockConnect.mockImplementation(({ callbacks }) => {
        attempts++;
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: {
                parts: [{ text: "Bad response" }],
              },
            },
          });
          callbacks.onmessage({
            serverContent: { turnComplete: true },
          });
        }, 10);
        return Promise.resolve(mockSession);
      });

      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      const result = await service.analyzeImage(
        "https://example.com/image.jpg",
        "hard",
      );
      expect(attempts).toBe((service as any).maxRetries);
      expect(result.rawResponse).toBe("Bad response");
      expect(result.result).toBeDefined();
    });
  });

  describe("gradeRawText", () => {
    it("should pass Grade A structure", () => {
      const validText = `
IMPACT: 10
VISUAL_WEIGHT: 10
COMPOSITION:
- negative_space: center
- shot_type: CU
- angle: eye
- balance: symmetrical
- subject_dominance: strong
COLOR_PROFILE:
- temperature: cold
- primary_color: blue
- secondary_colors: cyan
- contrast_level: high
MOOD_DNA:
- vibe: peaceful
- emotional_intensity: low
- rhythm: still
METAPHORICAL_FIELD:
one
two
three
four
five
CINEMATIC_NOTES:
This is a long enough sentence to satisfy the character count requirement of one hundred and fifty chars. It also has at least two sentences. Here is the second sentence.
`;
      const result = (service as any).gradeRawText(validText);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it("should fail if missing sections", () => {
      const invalidText = "IMPACT: 5";
      const result = (service as any).gradeRawText(invalidText, "hard");
      expect(result.passed).toBe(false);
      expect(result.failures).toContain("Missing section: VISUAL_WEIGHT:");
    });

    it("should fail if enums are invalid", () => {
      const invalidText = `
IMPACT: 5
VISUAL_WEIGHT: 5
COMPOSITION:
- negative_space: nowhere
COLOR_PROFILE:
- temperature: unknown
MOOD_DNA:
- vibe: neutral
METAPHORICAL_FIELD:
1
2
3
4
5
CINEMATIC_NOTES:
Sentence one. Sentence two. Long enough text here to pass the char count check probably.
`;
      const result = (service as any).gradeRawText(invalidText, "hard");
      expect(result.passed).toBe(false);
      expect(result.failures).toContain(
        "Composition or Color Profile enum validation failed",
      );
    });

    it("should pass with 'easy' level even if some checks fail", () => {
      // Missing some sub-fields but has headers and basic structure
      const partialText = `
IMPACT: 5
VISUAL_WEIGHT: 5
COMPOSITION:
- negative_space: center
COLOR_PROFILE:
- temperature: warm
MOOD_DNA:
- vibe: neutral
METAPHORICAL_FIELD:
word1
word2
word3
CINEMATIC_NOTES:
Small notes.
`;
      // Easy threshold is 50. Let's see what this gets.
      // Headers: 7/7 = 30
      // Numerics: 10
      // Enums: failures -> 0
      // Metaphors: 3 -> 0
      // Notes: too short -> 0
      // Total: 40. Now passes easy (30) but fails medium (75).

      const textWithHeaders = `
IMPACT: 5
VISUAL_WEIGHT: 5
COMPOSITION:
- negative_space: center
- shot_type: CU
- angle: eye
COLOR_PROFILE:
- temperature: warm
- contrast_level: low
MOOD_DNA:
- vibe: neutral
METAPHORICAL_FIELD:
word1
word2
word3
CINEMATIC_NOTES:
Small notes.
`;
      // Headers: 30
      // Numerics: 10
      // Enums: 20
      // Total: 60. Passes Easy (30) but fails Medium (75) and Hard (85).

      const resultEasy = (service as any).gradeRawText(textWithHeaders, "easy");
      expect(resultEasy.passed).toBe(true);
      expect(resultEasy.score).toBe(60);

      const resultHard = (service as any).gradeRawText(textWithHeaders, "hard");
      expect(resultHard.passed).toBe(false);
    });

    it("should bypass validation with 'none' level", () => {
      const emptyText = "";
      const result = (service as any).gradeRawText(emptyText, "none");
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe("DeepSeek Toggle Integration", () => {
    it("should skip detailed visual intent analysis when DeepSeek is disabled", async () => {
      // Mock fetch for image data
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      // Create a service instance where deepseek.isDeepSeekEnabled returns false
      const disabledDeepSeekMock = {
        get isDeepSeekEnabled() {
          return false;
        },
        analyzeDetailedVisualIntent: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiAnalysisService,
          { provide: DeepSeekService, useValue: disabledDeepSeekMock },
          { provide: PRISMA_SERVICE, useValue: mockPrisma },
        ],
      }).compile();

      const toggleService = module.get<GeminiAnalysisService>(
        GeminiAnalysisService,
      );

      mockPrisma.pexelsImage.findUnique.mockResolvedValue({
        id: "img-456",
        url: "http://test.com/img.jpg",
      });

      // Mock Gemini response
      mockConnect.mockImplementation(({ callbacks }) => {
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: { parts: [{ text: "Some rich description" }] },
            },
          });
          callbacks.onmessage({ serverContent: { turnComplete: true } });
        }, 10);
        return Promise.resolve(mockSession);
      });

      await toggleService.analyzeVisualIntent("img-456");

      // Verify DeepSeek was NOT called
      expect(
        disabledDeepSeekMock.analyzeDetailedVisualIntent,
      ).not.toHaveBeenCalled();
      // Verify nothing was saved to DB (due to early return in analyzeVisualIntent)
      expect(mockPrisma.visualIntentAnalysis.upsert).not.toHaveBeenCalled();
    });

    it("should skip refinement and mark job as COMPLETED when DeepSeek is disabled", async () => {
      const disabledDeepSeekMock = {
        get isDeepSeekEnabled() {
          return false;
        },
        parseGeminiRawResponse: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiAnalysisService,
          { provide: DeepSeekService, useValue: disabledDeepSeekMock },
          { provide: PRISMA_SERVICE, useValue: mockPrisma },
        ],
      }).compile();

      const toggleService = module.get<GeminiAnalysisService>(
        GeminiAnalysisService,
      );

      const mockJob = {
        id: "job-789",
        rawApiResponse: "some raw text",
        pexelsImage: { id: "img-789" },
      };

      mockPrisma.imageAnalysisJob.findUnique.mockResolvedValue(mockJob);

      await toggleService.refineWithDeepSeek("job-789");

      // Verify DeepSeek was NOT called
      expect(
        disabledDeepSeekMock.parseGeminiRawResponse,
      ).not.toHaveBeenCalled();
      // Verify job was updated to COMPLETED with error message
      expect(mockPrisma.imageAnalysisJob.update).toHaveBeenCalledWith({
        where: { id: "job-789" },
        data: expect.objectContaining({
          jobStatus: "COMPLETED",
          errorMessage: "Refinement skipped: DeepSeek disabled",
        }),
      });
    });
  });
});
