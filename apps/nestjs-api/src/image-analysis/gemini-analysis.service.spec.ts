import { Test, type TestingModule } from "@nestjs/testing";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { GoogleGenAI, Modality } from "@google/genai";

jest.mock("@google/genai");

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
    const mockAnalysisResult = {
      impact_score: 8,
      visual_weight: 7,
      composition: {
        negative_space: "right",
        shot_type: "WS",
        angle: "low",
      },
      mood_dna: {
        temp: "warm",
        primary_color: "#FF5733",
        vibe: "energetic",
      },
      metaphorical_tags: ["freedom", "adventure"],
    };

    it("should successfully analyze an image via Live API", async () => {
      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      // Simulate Gemini Live behavior
      mockConnect.mockImplementation(({ callbacks }) => {
        setTimeout(() => {
          callbacks.onopen();
          callbacks.onmessage({
            serverContent: {
              modelTurn: {
                parts: [{ text: JSON.stringify(mockAnalysisResult) }],
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

      expect(result).toEqual(mockAnalysisResult);
      expect(mockConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseModalities: [Modality.AUDIO, Modality.TEXT],
          }),
        }),
      );
    });

    it("should handle markdown code blocks in Live response", async () => {
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
                parts: [
                  {
                    text: `\`\`\`json\n${JSON.stringify(
                      mockAnalysisResult,
                    )}\n\`\`\``,
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

      const { result } = await service.analyzeImage(
        "https://example.com/image.jpg",
      );
      expect(result).toEqual(mockAnalysisResult);
    });

    it("should return default result if JSON is invalid", async () => {
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
                parts: [{ text: "invalid json" }],
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

      // Should return normalized default instead of throwing (as per new implementation)
      expect(result.impact_score).toBe(5);
      expect(result.visual_weight).toBe(5);
    });

    it("should handle image fetch failure", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      });

      await expect(
        service.analyzeImage("https://example.com/image.jpg"),
      ).rejects.toThrow("Failed to fetch image: Not Found");
    });
  });
});
