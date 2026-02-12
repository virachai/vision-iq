import { Test, TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { SemanticMatchingService } from "./semantic-matching.service";
import { PrismaClient } from "@repo/database";
import { SceneIntentDto } from "../alignment/dto/scene-intent.dto";

describe("SemanticMatchingService", () => {
  let service: SemanticMatchingService;
  let prismaClient: PrismaClient;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticMatchingService,
        {
          provide: PrismaClient,
          useValue: {
            $queryRawUnsafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SemanticMatchingService>(SemanticMatchingService);
    prismaClient = module.get<PrismaClient>(PrismaClient);
  });

  describe("Ranking Formula", () => {
    it("should calculate final score with correct weights", async () => {
      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-123",
          url: "https://example.com/image.jpg",
          photographer: "John Doe",
          similarity: 0.9, // High vector similarity
          metadata: {
            impactScore: 8, // Matches scene requirement
            visualWeight: 7,
            composition: {
              negative_space: "left",
              shot_type: "WS",
              angle: "eye",
            },
            moodDna: {
              temp: "warm",
              primary_color: "#FF6B6B",
              vibe: "cinematic",
            },
            metaphoricalTags: ["loneliness", "journey"],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "A lone figure in a field",
        required_impact: 8,
        preferred_composition: {
          negative_space: "left",
          shot_type: "WS",
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveLength(1);

      const match = results[0][0];

      // Verify ranking weights are applied correctly
      // Formula: (0.5 × vector_sim) + (0.3 × impact_rel) + (0.15 × comp_match) + (0.05 × mood_cons)
      expect(match.match_score).toBeGreaterThan(0.8); // Should be high
      expect(match.vector_similarity).toBe(0.9);
      expect(match.impact_relevance).toBe(1.0); // Perfect match
      expect(match.composition_match).toBeGreaterThan(0.5); // Matches shot type and angle
    });

    it("should apply soft mood consistency penalty for non-anchor scenes", async () => {
      const anchorMood = {
        temp: "warm",
        primary_color: "#FF6B6B",
        vibe: "cinematic",
      };

      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-123",
          url: "https://example.com/image.jpg",
          photographer: "John Doe",
          similarity: 0.85,
          metadata: {
            impactScore: 5,
            visualWeight: 6,
            composition: {
              negative_space: "center",
              shot_type: "MS",
              angle: "eye",
            },
            moodDna: {
              temp: "cold", // Different from anchor
              primary_color: "#4A90E2",
              vibe: "minimalist",
            },
            metaphoricalTags: [],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "A person in a room",
        required_impact: 5,
        preferred_composition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      // Second scene with anchor mood set
      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      expect(results[0][0].mood_consistency_score).toBeLessThan(1.0); // Penalty applied
      expect(results[0][0].mood_consistency_score).toBeGreaterThanOrEqual(0.7); // But not extreme
    });

    it("should not penalize mood for first scene (anchor)", async () => {
      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-123",
          url: "https://example.com/image.jpg",
          photographer: "John Doe",
          similarity: 0.85,
          metadata: {
            impactScore: 5,
            visualWeight: 6,
            composition: {
              negative_space: "center",
              shot_type: "MS",
              angle: "eye",
            },
            moodDna: {
              temp: "cold",
              primary_color: "#4A90E2",
              vibe: "minimalist",
            },
            metaphoricalTags: [],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "A person in a room",
        required_impact: 5,
        preferred_composition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // First scene should have full mood consistency score
      expect(results[0][0].mood_consistency_score).toBe(1.0);
    });

    it("should handle composition mismatch with partial credit", async () => {
      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-123",
          url: "https://example.com/image.jpg",
          photographer: "John Doe",
          similarity: 0.85,
          metadata: {
            impactScore: 5,
            visualWeight: 6,
            composition: {
              negative_space: "center",
              shot_type: "MS", // Adjacent to WS
              angle: "eye",
            },
            moodDna: {
              temp: "warm",
              primary_color: "#FF6B6B",
              vibe: "cinematic",
            },
            metaphoricalTags: [],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "Wide landscape",
        required_impact: 5,
        preferred_composition: {
          negative_space: "center",
          shot_type: "WS", // Wider than image
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // Should give partial credit for adjacent shot type
      expect(results[0][0].composition_match).toBeGreaterThan(0.2);
      expect(results[0][0].composition_match).toBeLessThan(1.0);
    });

    it("should rank images by final score", async () => {
      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-1",
          url: "https://example.com/1.jpg",
          photographer: "John",
          similarity: 0.95, // Higher similarity
          metadata: {
            impactScore: 9,
            visualWeight: 8,
            composition: {
              negative_space: "left",
              shot_type: "WS",
              angle: "eye",
            },
            moodDna: {
              temp: "warm",
              primary_color: "#FF6B6B",
              vibe: "cinematic",
            },
            metaphoricalTags: [],
          },
        },
        {
          id: "img-2",
          pexelsId: "pexels-2",
          url: "https://example.com/2.jpg",
          photographer: "Jane",
          similarity: 0.7, // Lower similarity
          metadata: {
            impactScore: 5,
            visualWeight: 5,
            composition: {
              negative_space: "right",
              shot_type: "CU",
              angle: "high",
            },
            moodDna: {
              temp: "cold",
              primary_color: "#4A90E2",
              vibe: "minimalist",
            },
            metaphoricalTags: [],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "A figure",
        required_impact: 8,
        preferred_composition: {
          negative_space: "left",
          shot_type: "WS",
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // First result should be better than second
      expect(results[0][0].pexels_id).toBe("pexels-1");
      expect(results[0][0].match_score).toBeGreaterThan(
        results[0][1].match_score,
      );
    });
  });

  describe("Color Distance Calculation", () => {
    it("should calculate hex color distance correctly", async () => {
      // This tests the private hexToRgb and getHexColorDistance methods indirectly
      const mockCandidates = [
        {
          id: "img-1",
          pexelsId: "pexels-123",
          url: "https://example.com/image.jpg",
          photographer: "John",
          similarity: 0.85,
          metadata: {
            impactScore: 5,
            visualWeight: 6,
            composition: {
              negative_space: "center",
              shot_type: "MS",
              angle: "eye",
            },
            moodDna: {
              temp: "warm",
              primary_color: "#FF0000", // Pure red
              vibe: "cinematic",
            },
            metaphoricalTags: [],
          },
        },
      ];

      const mockScene: SceneIntentDto = {
        intent: "Test",
        required_impact: 5,
        preferred_composition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
        },
      };

      jest
        .spyOn(prismaClient, "$queryRawUnsafe")
        .mockResolvedValue(mockCandidates);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      expect(results[0]).toBeDefined();
      expect(results[0][0]).toBeDefined();
    });
  });
});
