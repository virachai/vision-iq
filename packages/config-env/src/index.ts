import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { z } from "zod";

if (!process.env.POSTGRES_URL || !process.env.AUTH_SECRET) {
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
    path.resolve(process.cwd(), "..", "..", "..", ".env"),
  ];

  let envPath: string | undefined;
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      envPath = p;
      break;
    }
  }

  if (envPath) {
    const environment = config({ path: envPath });
    expand(environment);
  } else {
    console.warn("⚠️ No .env file found and critical variables are missing.");
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  POSTGRES_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  NEXTJS_DASHBOARD_AUTH_URL: z.string().url(),
  NESTJS_API_PORT: z.string().optional().default("4000"),
  API_EXPRESS_PORT: z.string().optional().default("5001"),
  ADMIN_PORT: z.string().optional().default("3001"),
  BLOG_PORT: z.string().optional().default("3004"),
  NEXTJS_DASHBOARD_PORT: z.string().optional().default("3003"),
  PRISMA_WEB_PORT: z.string().optional().default("3005"),
  STOREFRONT_PORT: z.string().optional().default("3002"),
  // Image Analysis & Semantic Matching
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_API_URL: z
    .string()
    .url()
    .optional()
    .default("https://api.deepseek.com/chat/completions"),
  GEMINI_API_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  REDIS_URL: z.string().url().optional().default("redis://localhost:6379"),
  BATCH_FAILURE_THRESHOLD: z.string().optional().default("0.1"),
  EMBEDDING_MODEL: z.string().optional().default("text-embedding-3-small"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  const errorMessage = `❌ Invalid environment variables: ${JSON.stringify(
    _env.error.format(),
    null,
    2,
  )}`;
  console.error(errorMessage);
  throw new Error(errorMessage);
}

export const env = _env.data;
