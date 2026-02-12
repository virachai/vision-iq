import { Test, type TestingModule } from "@nestjs/testing";
import axios, { AxiosError } from "axios";
import { GeminiAnalysisService } from "./gemini-analysis.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
		const mockImageResponse = {
			data: Buffer.from("fake-image-data"),
		};

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

		const mockGeminiResponse = {
			data: {
				candidates: [
					{
						content: {
							parts: [
								{
									text: JSON.stringify(mockAnalysisResult),
								},
							],
						},
					},
				],
			},
		};

		it("should successfully analyze an image", async () => {
			mockedAxios.get.mockResolvedValue(mockImageResponse);
			mockedAxios.post.mockResolvedValue(mockGeminiResponse);

			const result = await service.analyzeImage("http://example.com/image.jpg");

			expect(result).toEqual(mockAnalysisResult);
			expect(mockedAxios.get).toHaveBeenCalledWith(
				"http://example.com/image.jpg",
				expect.any(Object),
			);
			expect(mockedAxios.post).toHaveBeenCalled();
		});

		it("should handle markdown code blocks in response", async () => {
			mockedAxios.get.mockResolvedValue(mockImageResponse);
			mockedAxios.post.mockResolvedValue({
				data: {
					candidates: [
						{
							content: {
								parts: [
									{
										text: `\`\`\`json\n${JSON.stringify(mockAnalysisResult)}\n\`\`\``,
									},
								],
							},
						},
					],
				},
			});

			const result = await service.analyzeImage("http://example.com/image.jpg");
			expect(result).toEqual(mockAnalysisResult);
		});

		it("should retry on 429 or 503 errors", async () => {
			jest.useFakeTimers();
			mockedAxios.get.mockResolvedValue(mockImageResponse);

			// First fail with 429
			mockedAxios.post.mockRejectedValueOnce({
				response: { status: 429 },
			});

			// Then succeed
			mockedAxios.post.mockResolvedValueOnce(mockGeminiResponse);

			const promise = service.analyzeImage("http://example.com/image.jpg");

			await jest.runAllTimersAsync();
			const result = await promise;

			expect(result).toEqual(mockAnalysisResult);
			expect(mockedAxios.post).toHaveBeenCalledTimes(2);
			jest.useRealTimers();
		});

		it("should throw error if JSON is invalid", async () => {
			mockedAxios.get.mockResolvedValue(mockImageResponse);
			mockedAxios.post.mockResolvedValue({
				data: {
					candidates: [
						{
							content: {
								parts: [
									{
										text: "invalid json",
									},
								],
							},
						},
					],
				},
			});

			await expect(
				service.analyzeImage("http://example.com/image.jpg"),
			).rejects.toThrow("Invalid JSON from Gemini");
		});

		it("should normalize values out of range", async () => {
			const outOfRangeResult = {
				...mockAnalysisResult,
				impact_score: 15, // Should cover back to 10
				visual_weight: -5, // Should cover back to 1
			};

			mockedAxios.get.mockResolvedValue(mockImageResponse);
			mockedAxios.post.mockResolvedValue({
				data: {
					candidates: [
						{
							content: {
								parts: [{ text: JSON.stringify(outOfRangeResult) }],
							},
						},
					],
				},
			});

			const result = await service.analyzeImage("http://example.com/image.jpg");
			expect(result.impact_score).toBe(10);
			expect(result.visual_weight).toBe(1);
		});
	});
});
