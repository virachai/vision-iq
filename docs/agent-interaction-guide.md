# Vision-IQ Agent Interaction Guide 🤖

## 🎯 What is Vision-IQ?

Vision-IQ is a specialized **Visual Intent & Cinematic Alignment Engine**. It bridges the gap between **abstract narratives** (scripts, stories, conversational audio) and **cinematic imagery**.

Instead of searching for objects (e.g., "chair"), Vision-IQ searches for **emotional resonance and cinematic strategy** (e.g., "stagnation, wide shot, high contrast, warm tone").

---

## 🛠️ Project Structure for Agents

- **`apps/nestjs-api`**: The core engine. This is where the magic happens.
- **`packages/database`**: Prisma schema and clients (PostgreSQL).
- **`packages/env`**: Shared environment configuration.
- **`docs/`**: Technical details (`api-spec.md`, `main-flow.md`).

---

## 🚀 The "Happy Path" Workflow

If you are an agent trying to use this project, follow this sequence:

### 1. Extract Intent (`POST /alignment/extract-visual-intent`)

Pass raw text (e.g., "A man walks alone in a rainy city, feeling lost but determined").

- **Backend**: Calls DeepSeek to break this into "Scenes".
- **Result**: You get `SceneIntentDto[]`. Each scene contains emotional layers, composition strategies, and subject treatments.

### 2. Find/Sync Images (`POST /alignment/find-images`)

Pass the `SceneIntentDto[]` you just got.

- **Backend**: Uses vector similarity + cinematic ranking to find the best images in the library.
- **Auto-Sync**: If the library is empty or lacks matches, the system automatically uses keywords to pull from Pexels.

### 3. Verification & Refinement

- If the description isn't detailed enough, call `POST /alignment/refine-analysis/:jobId`.
- The system automatically triggers background workers (via BullMQ) to analyze new images using **Gemini Vision** for high-fidelity cinematic tagging.

---

## 🏗️ Key Endpoints for Agents

| Endpoint                           | Method | Purpose          | Why use it?                                        |
| :--------------------------------- | :----- | :--------------- | :------------------------------------------------- |
| `/alignment/extract-visual-intent` | `POST` | Text -> Intent   | Start here if you have a story skip text.          |
| `/alignment/find-images`           | `POST` | Intent -> Images | Use this to get actual URLs and match scores.      |
| `/alignment/sync-pexels`           | `POST` | Query -> Library | Manually expand the dataset if matches are poor.   |
| `/alignment/rollback/:requestId`   | `POST` | Cleanup          | Deletes a failed flow and all its associated data. |

---

## 🛡️ Feature Flags & Fallbacks (Important!)

We use feature flags to control costs and service availability. **Always check the `.env` flags if you get unexpected "generic" results.**

- **`ENABLE_DEEPSEEK`**: If `false`, intent extraction uses a simple regex-based fallback.
- **`ENABLE_GEMINI`**: If `false`, image analysis returns a generic "ok" status without deep cinematic tagging.
- **`ENABLE_PEXELS`**: If `false`, syncing will stop and return empty arrays.

**Agent Tip**: If you are debugging and see `Gemini disabled - Fallback returned`, check the flag in `.env`.

---

## 📈 Data Models You Should Know

### `SceneIntent`

The "Soul" of the scene. Look for `emotional_layer.vibe` and `spatial_strategy.shot_type`.

### `VisualIntentAnalysis`

The "DNA" of an image. Captured by Gemini. Contains `metaphoricalLayer`, `colorPsychology`, and `cinematicLeverage`.

---

## 💡 How to Query Effectively

Don't just send `"cat"`. Send high-context cinematic prompts.

- **Bad**: `imageUrl: "..."`
- **Good**: `raw_gemini_text: "A claustrophobic workspace at 3 AM, neon light flickering, smell of cold coffee and digital desperation."`

The engine will do the heavy lifting of turning that "desperation" into specific lighting and composition queries.
