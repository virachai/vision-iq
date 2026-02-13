# NestJS API Runbook - Vision IQ

This service provides the core API for Vision IQ, handling image ingestion, visual analysis, semantic matching, and queue management.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18+
- **pnpm**: v8+
- **Redis**: Required for BullMQ queues.
- **PostgreSQL**: Required with `pgvector` extension for semantic search.

### Environment Variables

The service uses `@repo/env` for configuration. Create a `.env` file in the monorepo root or set these variables:

| Variable                   | Description                    | Default                  |
| -------------------------- | ------------------------------ | ------------------------ |
| `PORT`                     | API Port                       | `3006`                   |
| `DATABASE_URL`             | PostgreSQL Connection String   | -                        |
| `REDIS_URL`                | Redis Connection String        | `redis://localhost:6379` |
| `PEXELS_API_KEY`           | API Key for Pexels Integration | -                        |
| `GEMINI_API_KEY`           | API Key for Gemini Analysis    | -                        |
| `PEXELS_REQUESTS_PER_HOUR` | Rate limit for Pexels Sync     | `200`                    |
| `PEXELS_RETRY_DELAY_MS`    | Base delay for 429 retries     | `1000`                   |

## 🛠 Scripts

Run these from `apps/nestjs-api`:

- `pnpm run dev`: Start in development mode with watch.
- `pnpm run build`: Compile the project.
- `pnpm run test`: Run Jest unit tests.
- `pnpm run lint`: Check code quality with Biome.
- `pnpm run format`: Format code with Biome.

## 🏗 Architecture & Key Features

### Pexels Sync Integration

Located in `src/pexels-sync`.

- Uses an `AsyncGenerator` to yield batches of images from Pexels.
- Implements exponential backoff for `429 Rate Limit` errors.
- Handles pagination correctly by iterating through `next_page` links.

### Queue Management (BullMQ)

Located in `src/queue`.

- **Image Analysis Queue**: Processes visual analysis using Gemini.
- **Embedding Generation Queue**: Generates vector embeddings for semantic search.
- Uses Redis for job persistence.

### Prisma & Vector Support

- Uses `@repo/database` for persistence.
- **Crucial**: PostgreSQL `vector` type is used for embeddings.
- Since Prisma doesn't natively support `Unsupported` types in all delegate methods, `QueueService` uses `this.prisma.$executeRaw` for persisting `ImageEmbedding` records to ensure compatibility.

### Module Resolution

- The project uses `paths` in `tsconfig.json` to resolve `@repo` workspace packages.
- CommonJS is used as the primary module system for NestJS compatibility.

## 🔍 Troubleshooting

### Module Resolution Errors

If you see `Cannot find module '@repo/database'`, ensure you've run `pnpm run generate` in `packages/database` first.

### ESM Compatibility

Some workspace packages (like `@repo/env`) may use ESM features. In `main.ts`, these are imported dynamically (`await import("@repo/env")`) to maintain CommonJS compatibility.

### Prisma Type Errors

If Prisma properties appear missing in services, verify that `prisma generate` was successful and that the generated client in `packages/database/generated/client` is up to date.
