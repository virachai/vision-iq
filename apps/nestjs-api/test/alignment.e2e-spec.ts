import { beforeAll, afterAll, describe, it, expect, jest } from "@jest/globals";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "./../src/app.module";
import { DeepSeekService } from "./../src/deepseek-integration/deepseek.service";
import { SemanticMatchingService } from "./../src/semantic-matching/semantic-matching.service";
import { PexelsIntegrationService } from "./../src/pexels-sync/pexels-integration.service";
import { QueueService } from "./../src/queue/queue.service";
import { PrismaClient } from "@repo/database";

describe("AlignmentController (e2e)", () => {
  let app: INestApplication;

  const mockDeepSeekService = {
    extractVisualIntent: jest.fn<any>(),
  };

  const mockSemanticMatchingService = {
    findAlignedImages: jest.fn<any>(),
  };

  const mockPexelsIntegrationService = {
    syncPexelsLibrary: jest.fn<any>(),
  };

  const mockQueueService = {
    queueImageAnalysis: jest.fn<any>(),
  };

  const mockPrismaClient = {
    pexelsImage: {
      upsert: jest.fn<any>(),
      count: jest.fn<any>(),
    },
    imageAnalysisJob: {
      create: jest.fn<any>(),
      count: jest.fn<any>(),
    },
    imageEmbedding: {
      count: jest.fn<any>(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DeepSeekService)
      .useValue(mockDeepSeekService)
      .overrideProvider(SemanticMatchingService)
      .useValue(mockSemanticMatchingService)
      .overrideProvider(PexelsIntegrationService)
      .useValue(mockPexelsIntegrationService)
      .overrideProvider(QueueService)
      .useValue(mockQueueService)
      .overrideProvider(PrismaClient)
      .useValue(mockPrismaClient)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  describe("POST /alignment/extract-visual-intent", () => {
    it("should return extracted scenes", () => {
      const mockScenes = [
        {
          intent: "A lone figure standing in an empty field",
          required_impact: 8,
          preferred_composition: {
            negative_space: "left",
            shot_type: "WS",
            angle: "eye",
          },
        },
      ];

      mockDeepSeekService.extractVisualIntent.mockResolvedValue(mockScenes);

      return request(app.getHttpServer())
        .post("/alignment/extract-visual-intent")
        .send({ rawGeminiText: "A man stands alone in a field" })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(mockScenes);
        });
    });
  });

  describe("POST /alignment/find-images", () => {
    it("should return matched images", () => {
      const mockMatches = [
        [
          {
            image_id: "img-1",
            pexels_id: "pexels-123",
            url: "https://example.com/image.jpg",
            match_score: 0.92,
          },
        ],
      ];

      mockSemanticMatchingService.findAlignedImages.mockResolvedValue(
        mockMatches,
      );

      return request(app.getHttpServer())
        .post("/alignment/find-images")
        .send({
          scenes: [
            {
              intent: "A lone figure",
              required_impact: 8,
              preferred_composition: {
                negative_space: "left",
                shot_type: "WS",
                angle: "eye",
              },
            },
          ],
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(mockMatches);
        });
    });
  });

  describe("GET /alignment/stats", () => {
    it("should return api statistics", () => {
      mockPrismaClient.pexelsImage.count.mockResolvedValue(100);
      mockPrismaClient.imageEmbedding.count.mockResolvedValue(90);
      mockPrismaClient.imageAnalysisJob.count.mockResolvedValue(10);

      return request(app.getHttpServer())
        .get("/alignment/stats")
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("total_images", 100);
          expect(res.body).toHaveProperty("total_embeddings", 90);
        });
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
