import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { SceneIntentDto, Composition } from "../alignment/dto/scene-intent.dto";

interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ParsedScene {
  intent: string;
  required_impact: number;
  preferred_composition: Composition;
}

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model = "deepseek-chat";

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || "";
    this.apiUrl =
      process.env.DEEPSEEK_API_URL ||
      "https://api.deepseek.com/chat/completions";

    if (!this.apiKey) {
      this.logger.warn("DEEPSEEK_API_KEY not configured");
    }
  }

  /**
   * Parse raw Gemini Live text into structured scene intents
   * Single scene per call (as per requirements)
   */
  async extractVisualIntent(rawGeminiText: string): Promise<SceneIntentDto[]> {
    try {
      // Prompt design: instruct model to extract scene visual intent
      const systemPrompt = `You are an expert film director who analyzes narrative scripts and extracts visual intent for each scene.
For each scene in the text, extract:
1. intent: A concrete visual description (e.g., "a lone figure standing in an endless field at sunset")
2. required_impact: A score 1-10 where the subject prominence matters (1=background, 10=primary focus)
3. preferred_composition: An object with negative_space (left/right/center), shot_type (CU/MS/WS), angle (low/eye/high)

Return ONLY a valid JSON array of scenes, no markdown, no explanations.
Example:
[
  {
    "intent": "A solitary figure overlooking a vast canyon at golden hour",
    "required_impact": 8,
    "preferred_composition": {
      "negative_space": "left",
      "shot_type": "WS",
      "angle": "eye"
    }
  }
]`;

      const userPrompt = `Parse this narrative text and extract scene visual intents:\n\n${rawGeminiText}`;

      const response = await this.callDeepSeekAPI(systemPrompt, userPrompt);

      // Parse response
      const parsed: ParsedScene[] = this.parseJsonResponse(response.content);

      // Validate and convert to DTOs
      const scenes = parsed.map((scene) => ({
        intent: scene.intent || "",
        required_impact: Math.min(10, Math.max(1, scene.required_impact || 5)),
        preferred_composition: this.validateComposition(
          scene.preferred_composition,
        ),
      }));

      this.logger.debug(`Extracted ${scenes.length} scenes from gemini text`);
      return scenes;
    } catch (error) {
      this.logger.error(
        "Failed to extract visual intent from Gemini text",
        error,
      );
      throw new Error(
        `DeepSeek extraction failed: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Call DeepSeek API with exponential backoff for rate limiting
   */
  private async callDeepSeekAPI(
    systemPrompt: string,
    userPrompt: string,
    retryCount = 0,
  ): Promise<{ content: string }> {
    const maxRetries = 3;

    try {
      const response = await axios.post<DeepSeekResponse>(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.3, // Lower temperature for consistency
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      const content = response.data.choices[0]?.message?.content || "";
      return { content };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle rate limiting with exponential backoff
      if (axiosError.response?.status === 429 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        this.logger.warn(`DeepSeek API rate limited, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callDeepSeekAPI(systemPrompt, userPrompt, retryCount + 1);
      }

      this.logger.error("DeepSeek API call failed", axiosError.message);
      throw error;
    }
  }

  /**
   * Parse JSON from response, handling markdown code blocks
   */
  private parseJsonResponse(content: string): ParsedScene[] {
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      this.logger.error("Failed to parse DeepSeek JSON response", error);
      throw new Error(
        `Invalid JSON response from DeepSeek: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Validate and normalize composition object
   */
  private validateComposition(comp: any): Composition {
    const validNegativeSpaces = ["left", "right", "center"];
    const validShotTypes = ["CU", "MS", "WS"];
    const validAngles = ["low", "eye", "high"];

    return {
      negative_space: validNegativeSpaces.includes(comp?.negative_space)
        ? comp.negative_space
        : "center",
      shot_type: validShotTypes.includes(comp?.shot_type)
        ? comp.shot_type
        : "MS",
      angle: validAngles.includes(comp?.angle) ? comp.angle : "eye",
    };
  }
}
