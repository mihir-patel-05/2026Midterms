import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from './env.js';
import { fecRateLimiter } from '../utils/rate-limiter.js';

export interface FECPaginatedResponse<T> {
  api_version: string;
  pagination: {
    count: number;
    page?: number;
    pages: number;
    per_page: number;
    last_indexes?: Record<string, string | number | null>;
  };
  results: T[];
}

export type FECKeysetCursor = Record<string, string | number>;

export interface FECKeysetBatch<T> {
  results: T[];
  nextCursor: FECKeysetCursor | null;
  exhausted: boolean;
}

export class FECClient {
  private client: AxiosInstance;
  private requestCount = 0;
  private lastLogTime = Date.now();

  constructor() {
    this.client = axios.create({
      baseURL: env.FEC_API_BASE_URL,
      params: {
        api_key: env.FEC_API_KEY,
      },
      timeout: 30000,
    });

    // OPTIMIZED: Reduced logging - only log every 20 requests or errors
    this.client.interceptors.request.use(
      (config) => {
        this.requestCount++;
        // Only log periodically to reduce I/O overhead
        if (this.requestCount % 20 === 0 || Date.now() - this.lastLogTime > 10000) {
          console.log(`➡️  FEC API: ${this.requestCount} requests sent`);
          this.lastLogTime = Date.now();
        }
        return config;
      },
      (error) => {
        console.error('❌ FEC API Request Error:', error.message);
        return Promise.reject(error);
      }
    );

    // OPTIMIZED: Only log errors, not all responses
    this.client.interceptors.response.use(
      (response) => response, // No logging for successful responses
      (error) => {
        if (error.response) {
          console.error(
            `❌ FEC API Error: ${error.response.status} - ${error.response.statusText}`
          );
        } else if (!error.message.includes('timeout')) {
          console.error('❌ FEC API Network Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a rate-limited GET request to the FEC API
   */
  async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<FECPaginatedResponse<T>>> {
    // Create unique job ID by including query parameters
    const params = new URLSearchParams(config?.params || {});
    const jobId = `GET ${endpoint}${params.toString() ? '?' + params.toString() : ''}`;

    return fecRateLimiter.schedule(
      { id: jobId },
      () => this.client.get<FECPaginatedResponse<T>>(endpoint, config)
    );
  }

  /**
   * Fetch all pages of a paginated endpoint
   */
  async *getAllPages<T>(
    endpoint: string,
    params: Record<string, any> = {},
    maxPages: number = Infinity
  ): AsyncGenerator<T[], void, unknown> {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const response = await this.get<T>(endpoint, {
        params: { ...params, page, per_page: 100 },
      });

      const { results, pagination } = response.data;

      if (results && results.length > 0) {
        yield results;
      }

      hasMore = page < pagination.pages;
      page++;

      if (hasMore) {
        console.log(
          `📄 Fetching page ${page}/${pagination.pages} for ${endpoint}...`
        );
      }
    }
  }

  /**
   * Fetch all results from a paginated endpoint (use with caution)
   */
  async getAll<T>(
    endpoint: string,
    params: Record<string, any> = {},
    maxPages: number = 10
  ): Promise<T[]> {
    const allResults: T[] = [];

    for await (const results of this.getAllPages<T>(endpoint, params, maxPages)) {
      allResults.push(...results);
    }

    return allResults;
  }

  /**
   * Fetch a bounded number of pages from OpenFEC's high-volume schedule
   * endpoints. Schedule A/B ignore page numbers and require the cursor values
   * returned in pagination.last_indexes to retrieve the next page.
   */
  async getAllKeyset<T>(
    endpoint: string,
    params: Record<string, any> = {},
    maxPages: number = 10
  ): Promise<T[]> {
    const batch = await this.getKeysetBatch<T>(endpoint, params, maxPages);
    return batch.results;
  }

  async getKeysetBatch<T>(
    endpoint: string,
    params: Record<string, any> = {},
    maxPages: number = 10,
    initialCursor: FECKeysetCursor = {},
  ): Promise<FECKeysetBatch<T>> {
    const allResults: T[] = [];
    let cursor = initialCursor;
    let serializedCursor = JSON.stringify(cursor);

    for (let fetchedPages = 0; fetchedPages < maxPages; fetchedPages++) {
      const response = await this.get<T>(endpoint, {
        params: { ...params, ...cursor, per_page: 100 },
      });
      const { results, pagination } = response.data;

      if (!results?.length) {
        return { results: allResults, nextCursor: null, exhausted: true };
      }
      allResults.push(...results);

      const nextCursor = Object.fromEntries(
        Object.entries(pagination.last_indexes ?? {}).filter(
          (entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined,
        ),
      );
      const serializedNextCursor = JSON.stringify(nextCursor);

      if (Object.keys(nextCursor).length === 0) {
        return { results: allResults, nextCursor: null, exhausted: true };
      }
      if (serializedNextCursor === serializedCursor) {
        throw new Error(`OpenFEC cursor did not advance for ${endpoint}`);
      }

      cursor = nextCursor;
      serializedCursor = serializedNextCursor;
    }

    return { results: allResults, nextCursor: cursor, exhausted: false };
  }
}

// Export singleton instance
export const fecClient = new FECClient();
