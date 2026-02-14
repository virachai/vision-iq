# Visual Intent–Driven Image Search System

## 🎯 Overview

The Visual Intent system bridges the gap between raw narrative (audio/text) and professional visual design. It uses a 4-layer cinematic analysis to extract deep visual requirements, ensuring that searched images match the emotional and psychological tone of the story.

## 🔬 The 4 Cinematic Intent Layers

### 1. Emotional Keyword Layer (Core Intent)

Focuses on the "vibe" and narrative weight.

- **Goal**: Find images that make the viewer feel a specific emotion.
- **Examples**: `overwhelmed`, `suffocation`, `liberation`, `stagnation`.

### 2. Spatial Strategy Layer (Composition)

Defines how the image space is utilized.

- **Goal**: Match the "space" of the audio (e.g., echo = wide space).
- **Keywords**: `wide shot`, `negative space center`, `asymmetrical`, `cluttered frame`.

### 3. Subject Treatment Layer (Psychological Framing)

Determines how the subject is presented to the viewer.

- **Goal**: Create a psychological connection or distance.
- **Keywords**: `hidden face`, `vulnerable posture`, `identity concealed`, `passive body language`.

### 4. Color & Temperature Mapping

Maps emotional temperature to visual tone.

- **Goal**: Use lighting to reinforce the scene's temperature.
- **Mapping**:
  - **Warm**: `warm tone`, `beige`, `golden hour`.
  - **Tense**: `harsh light`, `high contrast`, `neon`.
  - **Depressed**: `desaturated`, `muted colors`, `cold blue`.

---

## 🎬 Structured Search Formula

The system generates a human-readable and machine-optimized formula for search:

```text
CORE_INTENT: [Keywords]
SPATIAL_STRATEGY: [Composition Words]
SUBJECT_TREATMENT: [Psychological Keywords]
COLOR_PROFILE: [Tone Words]
EMOTIONAL_TONE: [Vibe]
KEYWORD_STRING: [Optimized Query String]
```

## 🚀 Implementation Benefits

- **Storytelling over Objects**: Searches for "isolation" instead of just "empty chair".
- **Visual Consistency**: Maintains lighting and composition strategy across a sequence of images.
- **Ranking Precision**: Re-ranks vector search results based on these cinematic layers.
