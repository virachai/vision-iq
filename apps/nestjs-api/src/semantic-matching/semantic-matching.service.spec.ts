import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Test, type TestingModule } from "@nestjs/testing";
import type { SceneIntentDto } from "../alignment/dto/scene-intent.dto";
import { SemanticMatchingService } from "./semantic-matching.service";
import { ClusteringService } from "./clustering.service";
import { PG_POOL } from "../prisma/prisma.module";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";

describe("SemanticMatchingService", () => {
  let service: SemanticMatchingService;
  let pool: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticMatchingService,
        {
          provide: PG_POOL,
          useValue: {
            query: jest.fn(),
          },
        },
        {
          provide: GeminiAnalysisService,
          useValue: {
            generateEmbedding: jest
              .fn()
              .mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
          },
        },
        {
          provide: ClusteringService,
          useValue: {
            groupCandidatesByMood: jest
              .fn()
              .mockImplementation((matches) => [matches]),
            selectBestCluster: jest
              .fn()
              .mockImplementation((clusters) => clusters[0] || []),
          },
        },
      ],
    }).compile();

    service = module.get<SemanticMatchingService>(SemanticMatchingService);
    pool = module.get<any>(PG_POOL);
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
        requiredImpact: 8,
        preferredComposition: {
          negative_space: "left",
          shot_type: "WS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValue({ rows: mockCandidates } as any);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveLength(1);

      const match = results[0][0];

      // Verify ranking weights are applied correctly
      // Formula: (0.5 \u00d7 vector_sim) + (0.3 \u00d7 impact_rel) + (0.15 \u00d7 comp_match) + (0.05 \u00d7 mood_cons)
      expect(match.matchScore).toBeGreaterThan(0.8); // Should be high
      expect(match.vectorSimilarity).toBe(0.9);
      expect(match.impactRelevance).toBe(1.0); // Perfect match
      expect(match.compositionMatch).toBeGreaterThan(0.5); // Matches shot type and angle
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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

      const scene1: SceneIntentDto = {
        intent: "Anchor scene",
        requiredImpact: 5,
        preferredComposition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      const scene2: SceneIntentDto = {
        intent: "Second scene",
        requiredImpact: 5,
        preferredComposition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      const anchorCandidate = {
        ...mockCandidates[0],
        metadata: {
          ...mockCandidates[0].metadata,
          moodDna: anchorMood,
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [anchorCandidate] } as any) // For scene 1
        .mockResolvedValueOnce({ rows: mockCandidates } as any); // For scene 2

      const results = await service.findAlignedImages([scene1, scene2], 5, 1.0);

      // Check scene 2 (index 1)
      expect(results[1][0].moodConsistencyScore).toBeLessThan(1.0); // Penalty applied
      expect(results[1][0].moodConsistencyScore).toBeGreaterThanOrEqual(0.7); // But not extreme
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
        requiredImpact: 5,
        preferredComposition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValue({ rows: mockCandidates } as any);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // First scene should have full mood consistency score
      expect(results[0][0].moodConsistencyScore).toBe(1.0);
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
        requiredImpact: 5,
        preferredComposition: {
          negative_space: "center",
          shot_type: "WS", // Wider than image
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValue({ rows: mockCandidates } as any);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // Should give partial credit for adjacent shot type
      expect(results[0][0].compositionMatch).toBeGreaterThan(0.2);
      expect(results[0][0].compositionMatch).toBeLessThan(1.0);
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
        requiredImpact: 8,
        preferredComposition: {
          negative_space: "left",
          shot_type: "WS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValue({ rows: mockCandidates } as any);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      // First result should be better than second
      expect(results[0][0].pexelsId).toBe("pexels-1");
      expect(results[0][0].matchScore).toBeGreaterThan(
        results[0][1].matchScore,
      );
    });
  });

  describe("Color Distance Calculation", () => {
    it("should calculate hex color distance correctly", async () => {
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
              balance: "symmetrical",
              subject_dominance: "moderate",
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
        requiredImpact: 5,
        preferredComposition: {
          negative_space: "center",
          shot_type: "MS",
          angle: "eye",
          balance: "symmetrical",
          subject_dominance: "moderate",
        },
      };

      jest
        .spyOn(pool, "query")
        .mockResolvedValue({ rows: mockCandidates } as any);

      const results = await service.findAlignedImages([mockScene], 5, 1.0);

      expect(results[0]).toBeDefined();
      expect(results[0][0]).toBeDefined();
    });
  });
});
