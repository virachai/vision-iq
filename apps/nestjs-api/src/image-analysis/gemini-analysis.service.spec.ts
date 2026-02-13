import { Test, type TestingModule } from "@nestjs/testing";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { GoogleGenAI } from "@google/genai";

jest.mock("@google/genai");

describe("GeminiAnalysisService", () => {
  let service: GeminiAnalysisService;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-api-key";

    mockGenerateContent = jest.fn();

    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
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

    it("should successfully analyze an image via SDK", async () => {
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify(mockAnalysisResult),
      });

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      const result = await service.analyzeImage(
        "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
      );

      expect(result).toEqual(mockAnalysisResult);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it("should handle markdown code blocks in response", async () => {
      mockGenerateContent.mockResolvedValue({
        text: `\`\`\`json\n${JSON.stringify(mockAnalysisResult)}\n\`\`\``,
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      const result = await service.analyzeImage(
        "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
      );
      expect(result).toEqual(mockAnalysisResult);
    });

    it("should throw error if JSON is invalid", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "invalid json",
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      await expect(
        service.analyzeImage(
          "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
        ),
      ).rejects.toThrow("Invalid JSON from Gemini");
    });

    it("should handle image fetch failure", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      });

      await expect(
        service.analyzeImage(
          "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
        ),
      ).rejects.toThrow("Failed to fetch image: Not Found");
    });

    it("should handle SDK errors", async () => {
      mockGenerateContent.mockRejectedValue(new Error("API Error"));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      await expect(
        service.analyzeImage(
          "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
        ),
      ).rejects.toThrow("Gemini analysis failed: API Error");
    });
  });

  describe("Initialization", () => {
    it("should warn if GEMINI_API_KEY is not set", () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const svc = new GeminiAnalysisService();
      expect(svc).toBeDefined();

      process.env.GEMINI_API_KEY = originalKey;
    });
  });
});
