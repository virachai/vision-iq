import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@repo/database";
import { Queue, Worker } from "bullmq";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";
import { PexelsSyncService } from "../pexels-sync/pexels-sync.service";
import { forwardRef, Inject } from "@nestjs/common";

interface ImageAnalysisJob {
  imageId: string;
  imageUrl: string;
  pexelsId: string;
  alt?: string;
}

interface EmbeddingGenerationJob {
  imageId: string;
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic metadata structure
  metadata: any;
}

interface AutoSyncJob {
  keywords: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private imageAnalysisQueue: Queue<ImageAnalysisJob>;
  private embeddingGenerationQueue: Queue<EmbeddingGenerationJob>;
  private autoSyncQueue: Queue<AutoSyncJob>;
  private imageAnalysisWorker: Worker<ImageAnalysisJob>;
  private embeddingGenerationWorker: Worker<EmbeddingGenerationJob>;
  private autoSyncWorker: Worker<AutoSyncJob>;

  private readonly redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    @Inject(forwardRef(() => PexelsSyncService))
    private readonly pexelsSyncService: PexelsSyncService,
  ) {}

  async onModuleInit() {
    this.logger.log("Initializing BullMQ queues");

    // Initialize queues
    this.imageAnalysisQueue = new Queue<ImageAnalysisJob>("image-analysis", {
      connection: this.parseRedisUrl(this.redisUrl),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    this.embeddingGenerationQueue = new Queue<EmbeddingGenerationJob>(
      "embedding-generation",
      {
        connection: this.parseRedisUrl(this.redisUrl),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
    );

    this.autoSyncQueue = new Queue<AutoSyncJob>("auto-sync", {
      connection: this.parseRedisUrl(this.redisUrl),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Initialize workers
    this.imageAnalysisWorker = new Worker<ImageAnalysisJob>(
      "image-analysis",
      async (job) => {
        return this.processImageAnalysis(job.data);
      },
      {
        connection: this.parseRedisUrl(this.redisUrl),
        concurrency: 5, // Process 5 images in parallel
      },
    );

    this.embeddingGenerationWorker = new Worker<EmbeddingGenerationJob>(
      "embedding-generation",
      async (job) => {
        return this.processEmbeddingGeneration(job.data);
      },
      {
        connection: this.parseRedisUrl(this.redisUrl),
        concurrency: 10, // Process 10 embeddings in parallel
      },
    );

    this.autoSyncWorker = new Worker<AutoSyncJob>(
      "auto-sync",
      async (job) => {
        return this.processAutoSync(job.data);
      },
      {
        connection: this.parseRedisUrl(this.redisUrl),
        concurrency: 1, // Single sync at a time to avoid Pexels rate limits
      },
    );

    // Setup event listeners
    this.setupWorkerListeners();

    this.logger.log("BullMQ queues initialized successfully");
  }

  async onModuleDestroy() {
    this.logger.log("Closing BullMQ workers and queues");
    await this.imageAnalysisWorker?.close();
    await this.embeddingGenerationWorker?.close();
    await this.autoSyncWorker?.close();
    await this.imageAnalysisQueue?.close();
    await this.embeddingGenerationQueue?.close();
    await this.autoSyncQueue?.close();
  }

  /**
   * Queue an image for analysis
   */
  async queueImageAnalysis(
    imageId: string,
    imageUrl: string,
    pexelsId: string,
    alt?: string,
  ) {
    try {
      const job = await this.imageAnalysisQueue.add(
        "analyze",
        { imageId, imageUrl, pexelsId, alt },
        {
          jobId: `analysis-${imageId}`,
          priority: 10,
        },
      );
      this.logger.debug(`Queued image analysis job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error(
        "Failed to queue image analysis",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Queue embedding generation for analyzed image
   */
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic metadata structure
  async queueEmbeddingGeneration(imageId: string, metadata: any) {
    try {
      const job = await this.embeddingGenerationQueue.add(
        "generate",
        { imageId, metadata },
        {
          jobId: `embedding-${imageId}`,
          priority: 5,
        },
      );
      this.logger.debug(`Queued embedding generation job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error(
        "Failed to queue embedding generation",
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Queue an automatic Pexels sync
   */
  async queueAutoSync(keywords: string) {
    try {
      const job = await this.autoSyncQueue.add(
        "sync",
        { keywords },
        {
          jobId: `autosync-${keywords.replace(/\s+/g, "-")}-${Date.now()}`,
          priority: 20,
        },
      );
      this.logger.debug(`Queued auto-sync job: ${job.id}`);
      return job.id;
    } catch (error) {
      this.logger.error("Failed to queue auto-sync", (error as Error).message);
      throw error;
    }
  }

  /**
   * Process image analysis job
   */
  private async processImageAnalysis(data: ImageAnalysisJob): Promise<void> {
    this.logger.log(`Processing image analysis: ${data.pexelsId}`);

    try {
      // Verify image still exists before proceeding
      const imageExists = await this.prisma.pexelsImage.findUnique({
        where: { id: data.imageId },
        select: { id: true },
      });

      if (!imageExists) {
        this.logger.warn(
          `Image ${data.imageId} (Pexels: ${data.pexelsId}) not found in database. Discarding analysis job.`,
        );
        return;
      }

      // Call Gemini to analyze image
      const { result: analysis, rawResponse } =
        await this.geminiAnalysisService.analyzeImage(
          data.imageUrl,
          "none",
          data.alt,
        );

      // Store metadata in database
      await this.prisma.imageMetadata.upsert({
        where: { imageId: data.imageId },
        update: {
          impactScore: analysis.impact_score,
          visualWeight: analysis.visual_weight,
          composition: analysis.composition as any,
          moodDna: analysis.mood_dna as any,
          metaphoricalTags: analysis.metaphorical_tags,
        },
        create: {
          imageId: data.imageId,
          impactScore: analysis.impact_score,
          visualWeight: analysis.visual_weight,
          composition: analysis.composition as any,
          moodDna: analysis.mood_dna as any,
          metaphoricalTags: analysis.metaphorical_tags,
        },
      });

      // Update job status
      await this.prisma.imageAnalysisJob.upsert({
        where: { imageId: data.imageId },
        update: {
          status: "COMPLETED",
          // biome-ignore lint/suspicious/noExplicitAny: Prisma JSON type mapping
          result: analysis as any,
          rawResponse: rawResponse,
        },
        create: {
          imageId: data.imageId,
          status: "COMPLETED",
          // biome-ignore lint/suspicious/noExplicitAny: Prisma JSON type mapping
          result: analysis as any,
          rawResponse: rawResponse,
        },
      });

      // Queue embedding generation - DISABLED per user request
      // await this.queueEmbeddingGeneration(data.imageId, analysis);

      this.logger.debug(`Image analysis completed: ${data.pexelsId}`);
    } catch (error) {
      this.logger.error(
        `Image analysis failed for ${data.pexelsId}`,
        (error as Error).message,
      );

      // Update job status to failed
      await this.prisma.imageAnalysisJob.upsert({
        where: { imageId: data.imageId },
        update: {
          status: "FAILED",
          errorMessage: (error as Error).message,
          retryCount: {
            increment: 1,
          },
        },
        create: {
          imageId: data.imageId,
          status: "FAILED",
          errorMessage: (error as Error).message,
        },
      });

      if ((error as any).code === "P2003") {
        this.logger.warn(
          `Foreign key constraint failed for image ${data.imageId} (Pexels: ${data.pexelsId}). Image may have been deleted.`,
        );
        return;
      }

      throw error;
    }
  }

  /**
   * Process embedding generation job
   * TODO: integrate with OpenAI text-embedding-3-small or local embedding model
   */
  private async processEmbeddingGeneration(
    data: EmbeddingGenerationJob,
  ): Promise<void> {
    this.logger.log(`Generating embedding for image: ${data.imageId}`);

    try {
      // Generate embedding from analysis metadata
      // For now, use a placeholder (in production, call OpenAI or local model)
      const embedding = await this.generateEmbedding(data.metadata);

      // Store embedding in database
      // Prisma doesn't support upsert/create with Unsupported types easily
      const embeddingArray = `[${embedding.join(",")}]`;

      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "vision_iq_image_embeddings" ("id", "imageId", "embedding", "updatedAt") 
           VALUES ($1, $2, $3::vector, NOW())
           ON CONFLICT ("imageId") DO UPDATE SET "embedding" = $3::vector, "updatedAt" = NOW()`,
          `emb-${data.imageId}`,
          data.imageId,
          embeddingArray,
        );
      } catch (error) {
        // Handle Foreign Key Violation (23503) - Image might have been deleted
        if ((error as any).code === "23503") {
          this.logger.warn(
            `Skipping embedding storage for ${data.imageId}: Image not found (FK violation)`,
          );
          return;
        }
        throw error;
      }

      this.logger.debug(`Embedding generated and stored: ${data.imageId}`);
    } catch (error) {
      this.logger.error(
        `Embedding generation failed for ${data.imageId}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Generate embedding from image metadata
   * TODO: Replace with actual embedding API call
   */
  // biome-ignore lint/suspicious/noExplicitAny: Embeddings are number arrays but return type is flexible here
  private async generateEmbedding(metadata: any): Promise<any> {
    // Placeholder: return random 1536-dim vector
    // In production, combine metadata fields and call OpenAI embeddings API
    const description = `${metadata.mood_dna?.vibe || ""} ${
      metadata.composition?.shot_type || ""
    } ${metadata.metaphorical_tags?.join(" ") || ""}`;

    // TODO: Call embedding API with description
    // For now, generate deterministic random based on description
    const embedding = new Array(1536).fill(0).map((_, i) => {
      return Math.sin(i + description.length) * 0.5 + 0.5;
    });

    return embedding;
  }

  /**
   * Process auto-sync job
   */
  private async processAutoSync(data: AutoSyncJob): Promise<void> {
    this.logger.log(`Processing auto-sync for keywords: "${data.keywords}"`);
    try {
      await this.pexelsSyncService.syncPexelsLibrary(data.keywords, 5);
      this.logger.debug(`Auto-sync completed for: "${data.keywords}"`);
    } catch (error) {
      this.logger.error(
        `Auto-sync failed for "${data.keywords}"`,
        (error as Error).message,
      );
      throw error;
    }
  }

  /**
   * Setup worker event listeners
   */
  private setupWorkerListeners() {
    this.imageAnalysisWorker.on("completed", (job) => {
      this.logger.debug(`Image analysis job completed: ${job.id}`);
    });

    this.imageAnalysisWorker.on("failed", (job, error) => {
      this.logger.error(
        `Image analysis job failed: ${job?.id} - ${error?.message}`,
      );
    });

    this.embeddingGenerationWorker.on("completed", (job) => {
      this.logger.debug(`Embedding generation job completed: ${job.id}`);
    });

    this.embeddingGenerationWorker.on("failed", (job, error) => {
      this.logger.error(
        `Embedding generation job failed: ${job?.id} - ${error?.message}`,
      );
    });

    this.autoSyncWorker.on("completed", (job) => {
      this.logger.debug(`Auto-sync job completed: ${job.id}`);
    });

    this.autoSyncWorker.on("failed", (job, error) => {
      this.logger.error(`Auto-sync job failed: ${job?.id} - ${error?.message}`);
    });
  }

  /**
   * Parse Redis URL into connection options
   */
  private parseRedisUrl(url: string) {
    const redisUrl = new URL(url);
    return {
      host: redisUrl.hostname,
      port: Number.parseInt(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? Number.parseInt(redisUrl.pathname.slice(1)) : 0,
    };
  }
}
