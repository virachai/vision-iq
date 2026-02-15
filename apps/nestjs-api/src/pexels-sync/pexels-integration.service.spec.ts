import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import axios from "axios";
import { PexelsIntegrationService } from "./pexels-integration.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("PexelsIntegrationService", () => {
  let service: PexelsIntegrationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.PEXELS_API_KEY = "test-api-key";
    process.env.PEXELS_REQUESTS_PER_HOUR = "100000";
    process.env.ENABLE_PEXELS = "true";

    const module: TestingModule = await Test.createTestingModule({
      providers: [PexelsIntegrationService],
    }).compile();

    service = module.get<PexelsIntegrationService>(PexelsIntegrationService);
  });

  describe("Feature Flag", () => {
    it("should return fallbacks when ENABLE_PEXELS is false", async () => {
      process.env.ENABLE_PEXELS = "false";
      const module: TestingModule = await Test.createTestingModule({
        providers: [PexelsIntegrationService],
      }).compile();
      const disabledService = module.get<PexelsIntegrationService>(
        PexelsIntegrationService,
      );

      const generator = disabledService.syncPexelsLibrary("test");
      const result = await generator.next();
      expect(result.done).toBe(true);

      const page = await (disabledService as any).getPexelsPage("test", 1, 10);
      expect(page.photos).toHaveLength(0);
      expect(page.total_results).toBe(0);
    });
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("syncPexelsLibrary", () => {
    const mockPhotos = Array(10)
      .fill(null)
      .map((_, i) => ({
        id: i,
        width: 100,
        height: 100,
        url: `http://example.com/${i}`,
        photographer: "Test Photographer",
        photographer_url: "http://example.com/photographer",
        photographer_id: 123,
        avg_color: "#FFFFFF",
        src: {
          original: "http://example.com/original",
          large: "http://example.com/large",
          large2x: "http://example.com/large2x",
          medium: "http://example.com/medium",
          small: "http://example.com/small",
          portrait: "http://example.com/portrait",
          landscape: "http://example.com/landscape",
          tiny: "http://example.com/tiny",
        },
        liked: false,
        alt: "Test Image",
      }));

    it("should yield batches of images", async () => {
      // Mock first response (total 10 items, batch size 5)
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          page: 1,
          per_page: 5,
          photos: mockPhotos.slice(0, 5), // First 5
          total_results: 10,
          next_page: "http://api.pexels.com/v1/search?page=2",
        },
      });

      // Mock second response for next page
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          page: 2,
          per_page: 5,
          photos: mockPhotos.slice(5, 10), // Next 5
          total_results: 10,
          next_page: null,
        },
      });

      const batches = [];
      for await (const batch of service.syncPexelsLibrary("test", 5)) {
        batches.push(batch);
      }

      expect(batches.length).toBe(2);
      expect(batches[0].images.length).toBe(5);
      expect(batches[0].batch_number).toBe(1);
      expect(batches[1].images.length).toBe(5);
      expect(batches[1].batch_number).toBe(2);

      expect(batches[0].images[0].alt).toBe("Test Image");

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it("should yield correct batch_number when starting from a non-zero startPage", async () => {
      const startPage = 3;
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          page: startPage,
          per_page: 5,
          photos: mockPhotos.slice(0, 5),
          total_results: 20,
          next_page: "http://api.pexels.com/v1/search?page=4",
        },
      });

      const generator = service.syncPexelsLibrary("test", 5, startPage);
      const firstBatch = await generator.next();

      expect(firstBatch.value?.batch_number).toBe(3);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ page: 3 }),
        }),
      );
    });

    it("should handle single page correctly", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          page: 1,
          per_page: 5,
          photos: mockPhotos.slice(0, 3),
          total_results: 3,
          next_page: null,
        },
      });

      const batches = [];
      for await (const batch of service.syncPexelsLibrary("test", 5)) {
        batches.push(batch);
      }

      expect(batches.length).toBe(1);
      expect(batches[0].images.length).toBe(3);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should respect rate limiting and retry on 429", async () => {
      process.env.PEXELS_RETRY_DELAY_MS = "1";

      // 1st call fails with 429
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 429 },
      });

      // 2nd call succeeds
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          page: 1,
          per_page: 5,
          photos: [],
          total_results: 0,
        },
      });

      const generator = service.syncPexelsLibrary("test");
      await generator.next();

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it("should throw error after max retries", async () => {
      process.env.PEXELS_RETRY_DELAY_MS = "1";

      // Fail 4 times (maxRetries is 3)
      const error = {
        message: "Rate limit exceeded",
        response: { status: 429 },
      };
      mockedAxios.get.mockRejectedValue(error);

      const generator = service.syncPexelsLibrary("test");

      try {
        await generator.next();
        throw new Error("Should have thrown");
      } catch (e: unknown) {
        expect((e as Error).message).toBe("Rate limit exceeded");
      }

      // Initial + 3 retries = 4 calls
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalledTimes(4);
    });
  });
});
