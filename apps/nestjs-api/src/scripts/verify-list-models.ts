import { GoogleGenAI } from "@google/genai";
require("dotenv").config();

// ts-node -r dotenv/config verify-list-models.ts
// ts-node -r dotenv/config ./apps/nestjs-api/src/scripts/verify-list-models.ts

async function run() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not set");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    console.log("Listing models...");

    const models = await ai.models.list();
    console.log("Available models:");

    // @ts-ignore
    for await (const m of models) {
      console.log(`- ${m.name} (Actions: ${m.supportedActions?.join(", ")})`);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

run();
