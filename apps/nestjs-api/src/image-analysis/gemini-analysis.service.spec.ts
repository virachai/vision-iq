import { Test, type TestingModule } from "@nestjs/testing";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { GoogleGenAI, Modality } from "@google/genai";

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

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-api-key";

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [GeminiAnalysisService],
    }).compile();

    service = module.get<GeminiAnalysisService>(GeminiAnalysisService);
  });

  describe("analyzeImage", () => {
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
      const result = (service as any).gradeRawText(invalidText);
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
      const result = (service as any).gradeRawText(invalidText);
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
});
