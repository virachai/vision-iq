import { Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosError } from "axios";

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
    alt: string;
  }>;
  batch_number: number;
  total_batches: number;
}

@Injectable()
export class PexelsIntegrationService {
  private readonly logger = new Logger(PexelsIntegrationService.name);
  private readonly apiKey: string;
  private readonly apiUrl = "https://api.pexels.com/v1/search";
  private readonly requestsPerHour: number;
  private lastRequestTime = 0;
  private readonly isEnabled: boolean;

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY || "";
    this.requestsPerHour = Number.parseInt(
      process.env.PEXELS_REQUESTS_PER_HOUR || "200",
      10,
    );
    this.isEnabled = process.env.ENABLE_PEXELS === "true";

    if (!this.apiKey) {
      this.logger.warn("PEXELS_API_KEY not configured");
    }

    if (this.isEnabled) {
      this.logger.log("Pexels integration is ENABLED");
    } else {
      this.logger.warn("Pexels integration is DISABLED via ENABLE_PEXELS flag");
    }
  }

  /**
   * Sync Pexels library in batches
   * Respects rate limiting (200 requests/hour)
   */
  async *syncPexelsLibrary(
    searchQuery: string,
    batchSize = 50,
    startPage = 1,
  ): AsyncGenerator<SyncBatch> {
    if (!this.isEnabled) {
      this.logger.debug("Skipping syncPexelsLibrary: Pexels disabled");
      return;
    }
    let page = startPage;
    let totalResults = 0;
    let batchNumber = startPage - 1;
    let totalBatches = 0;

    try {
      // Pexels API maximum per_page limit is 80
      const finalPerPage = Math.min(batchSize, 80);

      const firstResponse = await this.getPexelsPage(
        searchQuery,
        page,
        finalPerPage,
      );
      totalResults = firstResponse.total_results;
      totalBatches = Math.ceil(totalResults / finalPerPage);

      this.logger.log(
        `Starting sync of ${totalResults} images from Pexels (${totalBatches} batches) from page ${startPage}`,
      );

      // Process all pages
      let currentResponse = firstResponse;
      let allPhotos: PexelsPhoto[] = currentResponse.photos;

      while (true) {
        batchNumber++;

        // Yield current batch
        const batch = this.toBatch(
          allPhotos.slice(0, finalPerPage),
          batchNumber,
          totalBatches,
        );
        yield batch;

        allPhotos = allPhotos.slice(finalPerPage);

        // If we've processed all available photos and there's another page
        if (allPhotos.length < finalPerPage && currentResponse.next_page) {
          page++;
          currentResponse = await this.getPexelsPage(
            searchQuery,
            page,
            finalPerPage,
          );
          allPhotos = allPhotos.concat(currentResponse.photos);
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
    if (!this.isEnabled) {
      this.logger.debug("Skipping getPexelsPage: Pexels disabled");
      return {
        page: page,
        per_page: perPage,
        photos: [],
        total_results: 0,
        next_page: "",
      };
    }
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
        const baseDelay = Number.parseInt(
          process.env.PEXELS_RETRY_DELAY_MS || "1000",
          10,
        );
        const delay = 2 ** retryCount * baseDelay;
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
        alt: photo.alt,
      })),
      batch_number: batchNumber,
      total_batches: totalBatches,
    };
  }
}
