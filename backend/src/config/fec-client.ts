import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { env } from './env.js';
import { fecRateLimiter } from '../utils/rate-limiter.js';

export interface FECPaginatedResponse<T> {
  api_version: string;
  pagination: {
    count: number;
    page: number;
    pages: number;
    per_page: number;
  };
  results: T[];
}

export class FECClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.FEC_API_BASE_URL,
      params: {
        api_key: env.FEC_API_KEY,
      },
      timeout: 30000,
    });

    // Add request logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`➡️  FEC API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ FEC API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ FEC API Response: ${response.config.url} - Status ${response.status}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(
            `❌ FEC API Error: ${error.response.status} - ${error.response.statusText}`
          );
        } else {
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
    return fecRateLimiter.schedule(
      { id: `GET ${endpoint}` },
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
}

// Export singleton instance
export const fecClient = new FECClient();
