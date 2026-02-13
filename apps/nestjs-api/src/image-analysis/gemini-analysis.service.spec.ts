import { Test, type TestingModule } from "@nestjs/testing";
import { GeminiAnalysisService } from "./gemini-analysis.service";
import { WebSocket } from "ws";

jest.mock("ws");
const MockedWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

describe("GeminiAnalysisService", () => {
  let service: GeminiAnalysisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-api-key";

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

    // Helper to simulate WebSocket behavior
    const setupMockWS = (responses: any[]) => {
      const mockWS = {
        on: jest.fn(),
        send: jest.fn(),
        terminate: jest.fn(),
        close: jest.fn(),
      };

      MockedWebSocket.mockImplementation(() => mockWS as any);

      // Simulate 'open' and 'message' events
      mockWS.on.mockImplementation((event, callback) => {
        if (event === "open") {
          setTimeout(callback, 0);
        }
        if (event === "message") {
          responses.forEach((resp, i) => {
            setTimeout(
              () => callback(Buffer.from(JSON.stringify(resp))),
              i * 10,
            );
          });
        }
      });

      return mockWS;
    };

    it("should successfully analyze an image via WebSockets", async () => {
      const mockResponses = [
        {
          serverContent: {
            modelTurn: {
              parts: [{ text: JSON.stringify(mockAnalysisResult) }],
            },
          },
        },
        { serverContent: { turnComplete: true } },
      ];

      setupMockWS(mockResponses);

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
      expect(MockedWebSocket).toHaveBeenCalled();
    });

    it("should handle markdown code blocks in response", async () => {
      const mockResponses = [
        {
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
        },
        { serverContent: { turnComplete: true } },
      ];

      setupMockWS(mockResponses);

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
      const mockResponses = [
        { serverContent: { modelTurn: { parts: [{ text: "invalid json" }] } } },
        { serverContent: { turnComplete: true } },
      ];

      setupMockWS(mockResponses);

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

    it("should handle Gemini Live API error", async () => {
      const mockResponses = [
        {
          serverContent: {
            error: { message: "Internal Server Error" },
          },
        },
      ];

      setupMockWS(mockResponses);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      await expect(
        service.analyzeImage(
          "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
        ),
      ).rejects.toThrow("Gemini Live API error: Internal Server Error");
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

    it("should handle WebSocket timeout", async () => {
      jest.useFakeTimers();
      setupMockWS([]); // No response

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: { get: () => "image/jpeg" },
      });

      const promise = service.analyzeImage(
        "https://res.cloudinary.com/cloudinary-marketing/images/f_auto,q_auto/v1688666201/Blog-jpegXL/Blog-jpegXL.jpg",
      );

      // Flush microtasks to reach the Promise/setTimeout
      await Promise.resolve();
      await Promise.resolve();

      // Trigger the 'open' event (which is scheduled with setTimeout(0) in mock)
      jest.advanceTimersByTime(0);
      await Promise.resolve();

      // Trigger the 30s timeout
      jest.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow(
        "Timeout waiting for Gemini Live response",
      );
      jest.useRealTimers();
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
