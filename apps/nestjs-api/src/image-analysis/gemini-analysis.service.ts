import { Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosError } from "axios";

interface GeminiAnalysisResult {
	impact_score: number;
	visual_weight: number;
	composition: {
		negative_space: "left" | "right" | "center";
		shot_type: "CU" | "MS" | "WS";
		angle: "low" | "eye" | "high";
	};
	mood_dna: {
		temp: "warm" | "cold";
		primary_color: string;
		vibe: string;
	};
	metaphorical_tags: string[];
}

@Injectable()
export class GeminiAnalysisService {
	private readonly logger = new Logger(GeminiAnalysisService.name);
	private readonly apiKey: string;
	private readonly apiUrl =
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-vision-latest:generateContent";

	constructor() {
		this.apiKey = process.env.GEMINI_API_KEY || "";

		if (!this.apiKey) {
			this.logger.warn("GEMINI_API_KEY not configured");
		}
	}

	/**
	 * Analyze image using Gemini Vision API
	 * Extracts impact score, composition, mood, and metaphorical tags
	 */
	async analyzeImage(imageUrl: string): Promise<GeminiAnalysisResult> {
		try {
			const prompt = this.getAnalysisPrompt();

			const payload = {
				contents: [
					{
						parts: [
							{
								text: prompt,
							},
							{
								inline_data: {
									mime_type: "image/jpeg",
									data: await this.fetchImageAsBase64(imageUrl),
								},
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.4, // Lower temp for consistency
					topP: 0.8,
					topK: 40,
					maxOutputTokens: 1024,
				},
			};

			const response = await this.callGeminiAPI(payload);
			const analysis = this.parseGeminiResponse(response);

			this.logger.debug(
				`Analyzed image: impact=${analysis.impact_score}, tags=${analysis.metaphorical_tags.length}`,
			);
			return analysis;
		} catch (error) {
			this.logger.error("Image analysis failed", (error as Error).message);
			throw new Error(`Gemini analysis failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Generate analysis prompt for Gemini
	 */
	private getAnalysisPrompt(): string {
		return `You are a professional film cinematographer analyzing visual composition and mood.

Analyze this image and extract the following in JSON format:

1. impact_score (1-10): How prominent is the main subject? (1=barely visible, 10=fills frame)
2. visual_weight (1-10): Visual strength via contrast, saturation, clarity (1=flat, 10=striking)
3. composition: 
   - negative_space: "left" | "right" | "center" (where is empty space?)
   - shot_type: "CU" | "MS" | "WS" (Close-Up, Medium Shot, Wide Shot)
   - angle: "low" | "eye" | "high" (camera angle relative to subject)
4. mood_dna:
   - temp: "warm" | "cold" (color temperature)
   - primary_color: "#RRGGBB" (dominant color as hex)
   - vibe: string (descriptive mood e.g., "melancholic", "cinematic", "ethereal")
5. metaphorical_tags: array of 5-10 abstract concepts this image evokes
   Examples: ["loneliness", "breakthrough", "journey", "decay", "hope"]

Return ONLY valid JSON, no markdown, no explanation.`;
	}

	/**
	 * Fetch image from URL and convert to base64
	 */
	private async fetchImageAsBase64(imageUrl: string): Promise<string> {
		try {
			const response = await axios.get(imageUrl, {
				responseType: "arraybuffer",
				timeout: 15000,
			});

			return Buffer.from(response.data, "binary").toString("base64");
		} catch (error) {
			this.logger.error(
				`Failed to fetch image at ${imageUrl}`,
				(error as Error).message,
			);
			throw error;
		}
	}

	/**
	 * Call Gemini API with retry logic
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Wrapper for dynamic payload
	private async callGeminiAPI(payload: any, retryCount = 0): Promise<string> {
		const maxRetries = 3;

		try {
			const response = await axios.post(
				`${this.apiUrl}?key=${this.apiKey}`,
				payload,
				{
					headers: {
						"Content-Type": "application/json",
					},
					timeout: 60000,
				},
			);

			const content =
				response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
			return content;
		} catch (error) {
			const axiosError = error as AxiosError;

			// Retry on rate limiting or service unavailable
			if (
				[429, 503].includes(axiosError.response?.status || 0) &&
				retryCount < maxRetries
			) {
				const delay = 2 ** retryCount * 1000;
				this.logger.warn(`Gemini API rate limited, retrying in ${delay}ms`);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.callGeminiAPI(payload, retryCount + 1);
			}

			this.logger.error("Gemini API call failed", axiosError.message);
			throw error;
		}
	}

	/**
	 * Parse Gemini response into typed result
	 */
	private parseGeminiResponse(content: string): GeminiAnalysisResult {
		try {
			// Remove markdown code blocks if present
			let jsonStr = content.trim();
			if (jsonStr.startsWith("```json")) {
				jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
			} else if (jsonStr.startsWith("```")) {
				jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
			}

			const parsed = JSON.parse(jsonStr);

			// Validate and normalize
			return {
				impact_score: Math.min(10, Math.max(1, parsed.impact_score || 5)),
				visual_weight: Math.min(10, Math.max(1, parsed.visual_weight || 5)),
				composition: {
					negative_space: ["left", "right", "center"].includes(
						parsed.composition?.negative_space,
					)
						? parsed.composition.negative_space
						: "center",
					shot_type: ["CU", "MS", "WS"].includes(parsed.composition?.shot_type)
						? parsed.composition.shot_type
						: "MS",
					angle: ["low", "eye", "high"].includes(parsed.composition?.angle)
						? parsed.composition.angle
						: "eye",
				},
				mood_dna: {
					temp: parsed.mood_dna?.temp === "cold" ? "cold" : "warm",
					primary_color: parsed.mood_dna?.primary_color || "#808080",
					vibe: parsed.mood_dna?.vibe || "neutral",
				},
				metaphorical_tags: Array.isArray(parsed.metaphorical_tags)
					? parsed.metaphorical_tags.slice(0, 15)
					: [],
			};
		} catch (error) {
			this.logger.error(
				"Failed to parse Gemini response",
				(error as Error).message,
			);
			throw new Error(`Invalid JSON from Gemini: ${(error as Error).message}`);
		}
	}
}
