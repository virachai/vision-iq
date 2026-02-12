import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: {
    original: string;
    large: string;
    large2x: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}

interface PexelsApiResponse {
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  total_results: number;
  next_page: string;
}

interface SyncBatch {
  images: Array<{
    pexels_id: string;
    url: string;
    photographer: string;
    width: number;
    height: number;
    avg_color: string;
  }>;
  batch_number: number;
  total_batches: number;
}

@Injectable()
export class PexelsIntegrationService {
  private readonly logger = new Logger(PexelsIntegrationService.name);
  private readonly apiKey: string;
  private readonly apiUrl = "https://api.pexels.com/v1/search";
  private readonly requestsPerHour = 200;
  private lastRequestTime = 0;

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY || "";

    if (!this.apiKey) {
      this.logger.warn("PEXELS_API_KEY not configured");
    }
  }

  /**
   * Sync Pexels library in batches
   * Respects rate limiting (200 requests/hour)
   */
  async *syncPexelsLibrary(
    search_query: string,
    batchSize: number = 50,
  ): AsyncGenerator<SyncBatch> {
    let page = 1;
    let totalResults = 0;
    let batchNumber = 0;
    let totalBatches = 0;

    try {
      // First request to get total results
      const firstResponse = await this.getPexelsPage(
        search_query,
        page,
        batchSize,
      );
      totalResults = firstResponse.total_results;
      totalBatches = Math.ceil(totalResults / batchSize);

      this.logger.log(
        `Starting sync of ${totalResults} images from Pexels (${totalBatches} batches)`,
      );

      // Process all pages
      let allPhotos: PexelsPhoto[] = firstResponse.photos;

      while (true) {
        batchNumber++;

        // Yield current batch
        const batch = this.toBatch(
          allPhotos.slice(0, batchSize),
          batchNumber,
          totalBatches,
        );
        yield batch;

        allPhotos = allPhotos.slice(batchSize);

        // If we've processed all available photos or need another page
        if (allPhotos.length < batchSize && firstResponse.next_page) {
          page++;
          const nextResponse = await this.getPexelsPage(
            search_query,
            page,
            batchSize,
          );
          allPhotos = allPhotos.concat(nextResponse.photos);
        } else if (allPhotos.length === 0) {
          break; // All done
        }
      }

      this.logger.log(`Completed sync: ${batchNumber} batches processed`);
    } catch (error) {
      this.logger.error("Pexels sync failed", (error as Error).message);
      throw error;
    }
  }

  /**
   * Fetch a page from Pexels API with rate limiting and retry logic
   */
  private async getPexelsPage(
    query: string,
    page: number,
    perPage: number,
    retryCount = 0,
  ): Promise<PexelsApiResponse> {
    const maxRetries = 3;

    // Rate limiting: ensure ~200 requests/hour (one every 18 seconds)
    const minIntervalMs = (3600 * 1000) / this.requestsPerHour;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest < minIntervalMs) {
      const waitMs = minIntervalMs - timeSinceLastRequest;
      this.logger.debug(`Rate limit: waiting ${waitMs}ms before next request`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      this.lastRequestTime = Date.now();

      const response = await axios.get<PexelsApiResponse>(this.apiUrl, {
        params: {
          query,
          page,
          per_page: perPage,
        },
        headers: {
          Authorization: this.apiKey,
        },
        timeout: 30000,
      });

      this.logger.debug(
        `Fetched page ${page} from Pexels (${response.data.photos.length} photos)`,
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle rate limiting (429) with exponential backoff
      if (axiosError.response?.status === 429 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        this.logger.warn(`Pexels API rate limited, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.getPexelsPage(query, page, perPage, retryCount + 1);
      }

      this.logger.error(
        `Pexels API error: ${axiosError.response?.status} ${
          (error as Error).message
        }`,
      );
      throw error;
    }
  }

  /**
   * Convert Pexels API response to batch format
   */
  private toBatch(
    photos: PexelsPhoto[],
    batchNumber: number,
    totalBatches: number,
  ): SyncBatch {
    return {
      images: photos.map((photo) => ({
        pexels_id: photo.id.toString(),
        url: photo.src.large || photo.url,
        photographer: photo.photographer,
        width: photo.width,
        height: photo.height,
        avg_color: photo.avg_color,
      })),
      batch_number: batchNumber,
      total_batches: totalBatches,
    };
  }
}
