import {
  GoogleGenAI,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

// ⚠️ แนะนำใช้ model stable vision/text
const modelName = "models/gemini-2.5-flash-native-audio-preview-12-2025";

async function run(): Promise<void> {
  console.log(`Connecting to ${modelName}...`);

  let session: Session | undefined;
  let fullText = "";
  let turnCompleted = false;

  try {
    session = await ai.live.connect({
      model: modelName,
      config: {
        responseModalities: [Modality.AUDIO],
      },
      callbacks: {
        onopen: () => {
          console.log("✅ Connected");
        },

        onmessage: (msg: LiveServerMessage) => {
          const content = msg.serverContent;

          if (content?.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (part.text) {
                process.stdout.write(part.text);
                fullText += part.text;
              }
            }
          }

          if (content?.turnComplete) {
            console.log("\n✅ Turn complete");
            turnCompleted = true;
          }
        },

        onclose: () => {
          console.log("🔒 Session closed");
        },

        onerror: (err) => {
          console.error("❌ Error callback:", err);
        },
      },
    });

    console.log("Session object received.");

    console.log("Sending Hello...");
    session.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [{ text: "Hello, are you there?" }],
        },
      ],
    });

    // Wait for turnComplete instead of waiting for onclose
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for response"));
      }, 15000);

      const interval = setInterval(() => {
        if (turnCompleted) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    session.close();
  } catch (err) {
    console.error("Connection failed:", err);
    if (session) {
      try {
        session.close();
      } catch {}
    }
  }
}

run().catch(console.error);
