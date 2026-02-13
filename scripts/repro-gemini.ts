import { GoogleGenAI, LiveServerMessage } from "@google/genai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelName = "models/gemini-2.5-flash";

async function run() {
  console.log(`Connecting to ${modelName}...`);

  return new Promise<void>((resolve, reject) => {
    let fullText = "";

    ai.live
      .connect({
        model: modelName,
        config: {
          responseModalities: ["TEXT"],
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant." }],
          },
        },
        callbacks: {
          onopen: () => {
            console.log("Connected!");
            // Send a message
            setTimeout(() => {
              console.log("Sending Hello...");
              // We can't easily access session here in the callback pattern used in the service?
              // Wait, the service uses .then(session => ...)
              // But here we are inside the connect call.
              // The connect call returns a Promise that resolves to the session.
              // But we are defining callbacks inside the connect call options.
            }, 100);
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
              console.log("\nTurn complete.");
              // resolve(); // close session?
            }
          },
          onclose: () => {
            console.log("Closed.");
            if (fullText.length === 0) {
              console.error("Closed unexpectedly with 0 chars.");
            }
            resolve();
          },
          onerror: (err) => {
            console.error("Error:", err);
            reject(err);
          },
        },
      })
      .then((session) => {
        console.log("Session established object returned.");
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: "Hello, are you there?" }] }],
        });
      })
      .catch((err) => {
        console.error("Connection failed:", err);
        reject(err);
      });
  });
}

run().catch(console.error);
