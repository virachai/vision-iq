# RFC 001: Context-Aware Narrative Engine

| Status     | Proposed                                                                        |
| :--------- | :------------------------------------------------------------------------------ |
| **Author** | System Architect                                                                |
| **Date**   | 2026-02-15                                                                      |
| **Areas**  | `apps/nestjs-api`, `SemanticMatchingService`, `ContextState`                    |
| **Goal**   | Replace greedy image selection with a stateful, narrative-aware context system. |

---

## 1. Context and Problem Statement

### The Problem

Currently, the Vision-IQ engine operates on a **greedy, stateless basis**. When selecting an image for Scene N, it considers only the semantic match for Scene N’s prompt. It has no memory of Scene N-1 (beyond a simple "anchor mood" variable) and no foresight of the narrative arc.

This results in:

1.  **Visual Discontinuity:** Jumping between disjointed styles (e.g., photo-realistic → vector art → black & white).
2.  **Narrative Flatness:** The emotional intensity remains constant. A "climax" scene looks visually identical to an "intro" scene.
3.  **Subject Amnesia:** The engine forgets key subjects between scenes (e.g., "The Businessman" changes age, race, and suit color every 3 seconds).

### The Proposal

We propose introducing a **Context System** that maintains a persistent `ContextState` object throughout the generation pipeline. This system will act as a "Virtual Director," influencing image selection based on global narrative goals (Theme, Pacing) and local continuity constraints (Flow, Subject Permanence).

---

## 2. Design Goals

1.  **Statefulness:** The pipeline must pass a mutable `ContextState` object from scene to scene.
2.  **Hierarchical Control:** Global directives (Genre) should override local choices (Keyword match).
3.  **Extensibility:** The system must support future "Memory Modules" (e.g., Character LoRAs, User Preferences).
4.  **Performance:** The context check must be lightweight (< 50ms overhead) to avoid slowing down generation.

---

## 3. Proposed Solution

### 3.1. Data Model: `ContextState`

We will introduce a Typescript interface to track the narrative state.

```typescript
interface ContextState {
  // Global Directives (The "Script")
  global: {
    narrativeId: string;
    genre: "documentary" | "cinematic" | "explainer";
    visualStyle: "cyberpunk" | "minimalist" | "corporate";
    pacingCurve: "linear" | "exponential" | "sine";
  };

  // Dynamic State (The "Timeline")
  timeline: {
    currentBeat: number; // Scene Index
    totalBeats: number; // Total Scenes
    emotionalIntensity: number; // 0.0 - 1.0 (Current arousal level)
  };

  // Short-Term Memory (The "Flow")
  buffer: {
    prevImageId: string | null;
    prevVector: number[] | null; // For continuity checks
    activeSubject: string | null; // e.g., "protagonist_1"
  };
}
```

### 3.2. Architecture Changes

#### Phase 1: Injection (Prompt Engineering)

Modify `GeminiAnalysisService` to accept `ContextState`.

- **Before:** `generatePrompts(script)`
- **After:** `generatePrompts(script, contextState)`

_Impact:_ The LLM will now receive instructions like: _"This is Scene 3 of a Horror video. Increasing tension. Previous scene was dark/blue. Generate a prompt for a 'scared face' that matches this tone."_

#### Phase 2: Reranking (The "Filter")

Modify `SemanticMatchingService` to use a weighted scoring function.

$$
Score_{final} = (0.4 \times Sim_{semantic}) + (0.3 \times Sim_{visual\_continuity}) + (0.3 \times Score_{narrative\_fit})
$$

Where:

- $Sim_{semantic}$: Standard vector similarity.
- $Sim_{visual\_continuity}$: Cosine similarity between Candidate Vector and `context.buffer.prevVector`.
- $Score_{narrative\_fit}$: Metadata check (e.g., does the image's "Intensity" score match `context.timeline.emotionalIntensity`?).

---

## 4. Alternatives Considered

### Alternative A: Post-Processing Filter

_Description:_ Build the video greedily, then run a "pass" to swap out bad matches.
_Pros:_ Simpler initial generation.
_Cons:_ Very expensive/slow. "Fixing" a bad sequence is harder than generating a good one.

### Alternative B: Hard Constraints

_Description:_ Strictly filter images (SQL `WHERE` clause) based on context (e.g., `WHERE style = 'cinematic'`).
_Pros:_ Guarantees consistency.
_Cons:_ High risk of returning 0 results (Zero-hit problem). Soft ranking is safer.

---

## 5. Implementation Plan

| Step | Description                                                     | Estimated Effort |
| :--- | :-------------------------------------------------------------- | :--------------- |
| 1    | Define `ContextState` interface in `shared/types`.              | 1 Day            |
| 2    | Update `PipelineService` to initialize and pass `ContextState`. | 2 Days           |
| 3    | Implement `ContextAwareReranker` in `SemanticMatchingService`.  | 3 Days           |
| 4    | Add "Visual Continuity" vector check (pgvector).                | 2 Days           |
| 5    | Testing & Tuning weights.                                       | 3 Days           |

---

## 6. Metrics & Success Criteria

- **Visual Continuity Score:** Automated metric (average cosine similarity between consecutive frames). Target: > 0.75.
- **User Retention:** A/B test "Context-Aware" videos vs. "Greedy" videos on YouTube. Target: +15% retention.

---

## 7. Open Questions

1.  How do we handle "Cut" transitions where visual discontinuity is _desired_? (e.g., "Meanwhile, in Tokyo...")
    - _Proposed Solution:_ The `ContextState` should include a `transitionType` flag. If `transition === 'hard_cut'`, the continuity weight is set to 0.
2.  Should we persist ContextState in the DB?
    - _Proposed Solution:_ Yes, as a JSONB column on the `VisionRequest` table, to allow for resuming/retrying jobs.
