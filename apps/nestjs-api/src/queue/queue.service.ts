import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { PrismaClient } from "@repo/database";
import { GeminiAnalysisService } from "../image-analysis/gemini-analysis.service";

interface ImageAnalysisJob {
  imageId: string;
  imageUrl: string;
  pexelsId: string;
}

interface EmbeddingGenerationJob {
  imageId: string;
  metadata: any;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private imageAnalysisQueue: Queue<ImageAnalysisJob>;
  private embeddingGenerationQueue: Queue<EmbeddingGenerationJob>;
  private imageAnalysisWorker: Worker<ImageAnalysisJob>;
  private embeddingGenerationWorker: Worker<EmbeddingGenerationJob>;

  private readonly redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  constructor(
    private readonly prisma: PrismaClient,
    private readonly geminiAnalysisService: GeminiAnalysisService,
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

    // Setup event listeners
    this.setupWorkerListeners();

    this.logger.log("BullMQ queues initialized successfully");
  }

  async onModuleDestroy() {
    this.logger.log("Closing BullMQ workers and queues");
    await this.imageAnalysisWorker?.close();
    await this.embeddingGenerationWorker?.close();
    await this.imageAnalysisQueue?.close();
    await this.embeddingGenerationQueue?.close();
  }

  /**
   * Queue an image for analysis
   */
  async queueImageAnalysis(
    imageId: string,
    imageUrl: string,
    pexelsId: string,
  ) {
    try {
      const job = await this.imageAnalysisQueue.add(
        "analyze",
        { imageId, imageUrl, pexelsId },
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
   * Process image analysis job
   */
  private async processImageAnalysis(data: ImageAnalysisJob): Promise<void> {
    this.logger.log(`Processing image analysis: ${data.pexelsId}`);

    try {
      // Call Gemini to analyze image
      const analysis = await this.geminiAnalysisService.analyzeImage(
        data.imageUrl,
      );

      // Store metadata in database
      await this.prisma.imageMetadata.upsert({
        where: { imageId: data.imageId },
        update: {
          impactScore: analysis.impact_score,
          visualWeight: analysis.visual_weight,
          composition: analysis.composition,
          moodDna: analysis.mood_dna,
          metaphoricalTags: analysis.metaphorical_tags,
        },
        create: {
          imageId: data.imageId,
          impactScore: analysis.impact_score,
          visualWeight: analysis.visual_weight,
          composition: analysis.composition,
          moodDna: analysis.mood_dna,
          metaphoricalTags: analysis.metaphorical_tags,
        },
      });

      // Update job status
      await this.prisma.imageAnalysisJob.update({
        where: { imageId: data.imageId },
        data: {
          status: "COMPLETED",
          result: analysis,
        },
      });

      // Queue embedding generation
      await this.queueEmbeddingGeneration(data.imageId, analysis);

      this.logger.debug(`Image analysis completed: ${data.pexelsId}`);
    } catch (error) {
      this.logger.error(
        `Image analysis failed for ${data.pexelsId}`,
        (error as Error).message,
      );

      // Update job status to failed
      await this.prisma.imageAnalysisJob.update({
        where: { imageId: data.imageId },
        data: {
          status: "FAILED",
          errorMessage: (error as Error).message,
          retryCount: {
            increment: 1,
          },
        },
      });

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
      await this.prisma.imageEmbedding.upsert({
        where: { imageId: data.imageId },
        update: {
          embedding,
        },
        create: {
          imageId: data.imageId,
          embedding,
        },
      });

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
  }

  /**
   * Parse Redis URL into connection options
   */
  private parseRedisUrl(url: string) {
    const redisUrl = new URL(url);
    return {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? parseInt(redisUrl.pathname.slice(1)) : 0,
    };
  }
}
