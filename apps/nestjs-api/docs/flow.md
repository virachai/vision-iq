# NestJS API Core Flows

This document outlines the primary architectural flows within the Vision-IQ NestJS API.

## 1. Narrative Extraction Flow

Processes raw conversational text (e.g., from Gemini Live) into structured scenes for visual orchestration.

```mermaid
sequenceDiagram
    participant User
    participant AlignmentController
    participant AlignmentService
    participant DeepSeekService
    participant DeepSeekAPI

    User->>AlignmentController: POST /alignment/extract-intent
    AlignmentController->>AlignmentService: extractVisualIntent(rawText)
    AlignmentService->>DeepSeekService: extractVisualIntent(rawText)
    DeepSeekService->>DeepSeekAPI: Chat Completion (v3)
    DeepSeekAPI-->>DeepSeekService: JSON Scene Array
    DeepSeekService-->>AlignmentService: SceneIntentDto[]
    AlignmentService-->>AlignmentController: SceneIntentDto[]
    AlignmentController-->>User: 200 OK (Scenes)
```

## 2. Semantic Image Matching Flow

Finds the most relevant images for a sequence of scenes using vector similarity and cinematic metadata.

```mermaid
graph TD
    A[Input Scenes] --> B[Generate Text Embedding]
    B --> C[Vector Search - pgvector]
    C --> D[Metadata Filtering]
    D --> E[Ranking Formula]
    E --> F[Alignment Result]

    subgraph "Ranking Weights"
        W1[Vector Similarity: 50%]
        W2[Impact Relevance: 30%]
        W3[Composition Match: 15%]
        W4[Mood Consistency: 5%]
    end
```

### Visual Anchor Logic

The first image matched for the first scene establishes a **Mood Anchor**. Subsequent matches are penalized if their `MoodDna` (color temperature, primary color) deviates significantly from this anchor, ensuring visual continuity.

## 3. Library Synchronization Flow

Ingests images from external providers (Pexels) and initiates the analysis pipeline.

```mermaid
sequenceDiagram
    participant Admin
    participant AlignmentService
    participant PexelsService
    participant Prisma
    participant QueueService

    Admin->>AlignmentService: syncPexelsLibrary(query)
    AlignmentService->>PexelsService: syncPexelsLibrary(query)
    loop For each batch
        PexelsService-->>AlignmentService: Image Batch
        AlignmentService->>Prisma: Upsert PexelsImage
        AlignmentService->>Prisma: Create ImageAnalysisJob (PENDING)
        AlignmentService->>QueueService: queueImageAnalysis(imageId)
    end
    AlignmentService-->>Admin: SyncResult (queued)
```

## 4. Asynchronous Analysis Pipeline

The background process powered by BullMQ that enriches images with AI-driven metadata.

```mermaid
flowchart LR
    Q1[Image Analysis Queue] --> W1[Gemini Vision Worker]
    W1 --> G[Gemini 1.5 Vision]
    G --> DB[(Store Metadata)]
    DB --> Q2[Embedding Queue]
    Q2 --> W2[Embedding Worker]
    W2 --> V[(Store pgvector)]
```

- **Gemini Vision Worker**: Extracts impact scores, shot types, camera angles, and metaphorical tags.
- **Embedding Worker**: Transforms visual metadata into high-dimensional vectors for semantic search.
