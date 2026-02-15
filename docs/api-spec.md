# Vision IQ NestJS API Specification

## Overview

The Vision IQ API is a NestJS-based backend service for visual intent analysis and image alignment. It provides endpoints for extracting visual intents from conversational text, analyzing images, syncing with Pexels, and finding semantically aligned images.

**Base URL**: `http://localhost:{NESTJS_API_PORT}` (default: configured via `@repo/env`)

**CORS**: Enabled for all origins

---

## Endpoints

### Root

#### `GET /`

Returns a simple health check message.

**Response**:

```json
"Hello World!"
```

---

### Alignment Module

The Alignment module handles visual intent extraction, image analysis, Pexels synchronization, and semantic image matching.

#### `POST /alignment/extract-visual-intent`

Extract scene visual intents from raw conversational text (e.g., from Gemini Live).

**Request Body** (`ExtractVisualIntentDto`):

```typescript
{
  raw_gemini_text: string;      // Conversational text from Gemini Live
  auto_match?: boolean;          // Automatically trigger image matching/syncing
}
```

**Response** (`SceneIntentDto[]`):

```typescript
[
  {
    intent: string;                        // Raw description of what the scene should show
    required_impact: number;               // 1.0 - 10.0: subject prominence
    preferred_composition: {
      negative_space?: "left" | "right" | "center";
      shot_type?: "CU" | "MS" | "WS";      // Close-up, Medium Shot, Wide Shot
    };
    visual_intent?: {
      emotional_layer?: {
        intent_words: string[];            // e.g., ["overwhelmed", "suffocation"]
        vibe: string;
      };
      spatial_strategy?: {
        strategy_words: string[];          // e.g., ["negative space center", "wide shot"]
        shot_type: string;
        balance: string;
      };
      subject_treatment?: {
        treatment_words: string[];         // e.g., ["hidden face", "vulnerable posture"]
        identity: string;
        dominance: string;
      };
      color_mapping?: {
        temperature_words: string[];       // e.g., ["harsh light", "warm tone"]
        temperature: "warm" | "cold";
        contrast: "low" | "medium" | "high";
      };
    };
  }
]
```

---

#### `POST /alignment/test-analysis`

Direct test endpoint for Gemini image analysis.

**Request Body**:

```typescript
{
  imageUrl: string; // URL of the image to analyze
}
```

**Response**: Analysis result from Gemini (structure varies based on implementation)

---

#### `POST /alignment/refine-analysis/:jobId`

Refine an existing analysis job using DeepSeek.

**Path Parameters**:

- `jobId` (string): The ID of the image analysis job to refine

**Response**: Refined analysis result

---

#### `POST /alignment/find-images`

Find semantically aligned images for a sequence of scenes.

**Request Body** (`FindAlignedImagesDto`):

```typescript
{
  scenes: SceneIntentDto[];              // Array of scene intents
  top_k?: number;                        // Default: 5 results per scene
  mood_consistency_weight?: number;      // 0-1, default 0.05 (5%)
}
```

**Response** (`ImageMatch[][]`):

```typescript
[
  [
    {
      image_id: string;
      pexels_id: string;
      url: string;
      match_score: number;               // 0-1 overall match score
      vector_similarity: number;
      impact_relevance: number;
      composition_match: number;
      mood_consistency_score: number;
      metadata: any;                     // ImageMetadata + composition + moodDna
    }
  ]
]
```

**Ranking Breakdown**:

- `vector_similarity_weight`: 0.5 (50%)
- `impact_relevance_weight`: 0.3 (30%)
- `composition_match_weight`: 0.15 (15%)
- `mood_consistency_weight`: 0.05 (5%)

---

#### `POST /alignment/sync-pexels`

Trigger Pexels library sync with a search query.

**Request Body**:

```typescript
{
  searchQuery?: string;   // Default: "nature"
  batchSize?: number;     // Default: 50
}
```

**Response**: Sync operation result

---

#### `POST /alignment/sync-pexels/:descriptionId`

Trigger keyword-based sync for a specific visual description.

**Path Parameters**:

- `descriptionId` (string): The ID of the visual description

**Response**: Sync operation result for the specific description

---

#### `POST /alignment/trigger-keyword-sync`

Manually trigger the automated sync flow for all descriptions with unused keywords.

**Response**: Sync operation result

---

#### `GET /alignment/stats`

Get sync and analysis statistics.

**Response**:

```typescript
{
  // Statistics about sync operations, analysis jobs, etc.
  // Structure depends on implementation
}
```

---

#### `POST /alignment/rollback/:requestId`

Rollback a visual intent request and all its downstream entities (scenes, descriptions, keywords, sync history, images, analysis jobs).

**Path Parameters**:

- `requestId` (string): The ID of the visual intent request to rollback

**Response**: Rollback operation result

---

### Links Module

The Links module provides basic CRUD operations for managing links (appears to be a demo/example resource).

#### `POST /links`

Create a new link.

**Request Body** (`CreateLinkDto`):

```typescript
{
  title: string;
  url: string;
  description: string;
}
```

**Response**: Created link entity

---

#### `GET /links`

Get all links.

**Response**: Array of link entities

---

#### `GET /links/:id`

Get a specific link by ID.

**Path Parameters**:

- `id` (string): The link ID (converted to number internally)

**Response**: Link entity

---

#### `PATCH /links/:id`

Update a link.

**Path Parameters**:

- `id` (string): The link ID (converted to number internally)

**Request Body** (`UpdateLinkDto`):

```typescript
{
  title?: string;       // All fields are optional
  url?: string;
  description?: string;
}
```

**Response**: Updated link entity

---

#### `DELETE /links/:id`

Delete a link.

**Path Parameters**:

- `id` (string): The link ID (converted to number internally)

**Response**: Deletion confirmation

---

## Data Models

### Visual Intent Analysis

The `VisualIntentAnalysis` model represents a deep analysis of an image's visual intent across multiple dimensions:

```typescript
{
  coreIntent: {
    intent: string;
    visual_goal: string;
  };
  spatialStrategy: {
    shot_type: string;
    negative_space: string;
    balance: string;
  };
  subjectTreatment: {
    identity: string;
    dominance: string;
    eye_contact: string;
  };
  colorPsychology: {
    palette: string[];
    contrast: string;
    mood: string;
  };
  emotionalArchitecture: {
    vibe: string;
    rhythm: string;
    intensity: string;
  };
  metaphoricalLayer: {
    objects: string[];
    meaning: string;
  };
  cinematicLeverage: {
    angle: string;
    lighting: string;
    sound: string;
  };
}
```

---

## Architecture Notes

- **Database**: PostgreSQL via Prisma ORM (`@repo/database`)
- **Environment**: Configuration managed via `@repo/env`
- **Scheduling**: Uses `@nestjs/schedule` for cron jobs and automated tasks
- **Modules**:
  - `AlignmentModule`: Core visual intent and image alignment logic
  - `LinksModule`: Demo CRUD resource
  - `PrismaModule`: Database connection and client

---

## Error Handling

The API follows standard NestJS error handling conventions. Common HTTP status codes:

- `200 OK`: Successful operation
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request body or parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server-side error

---

## Development

**Start the API**:

```bash
npm run dev
```

**Build**:

```bash
npm run build
```

**Test**:

```bash
npm run test
```
