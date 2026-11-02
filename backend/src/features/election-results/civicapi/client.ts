/**
 * Fetching civicAPI (docs/plans/civicapi-results.md, "Fetch"). One token bucket caps every request
 * this process makes, a timeout or 5xx is retried once with jitter (a 4xx never is), and each body
 * comes back as a `RawResultsDocument` with its SHA-256. Browsers never call civicAPI.
 */
import { createHash } from 'node:crypto';
import type { RawResultsDocument } from '../parser.js';

export interface CivicApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Requests per second across the whole client. */
  maxRps: number;
  userAgent?: string;
  /** Injectable for tests and `--replay`. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchedDocument extends RawResultsDocument<unknown> {
  bytes: Buffer;
  httpStatus: number;
  /** A 304 against the last ETag: nothing changed and there is no body. */
  notModified: boolean;
}

export class CivicApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'CivicApiError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function sha256(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class CivicApiClient {
  private readonly etags = new Map<string, string>();
  private nextSlot = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: CivicApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  url(path: string) {
    return `${this.options.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  /** Waits for this request's slot so the client never exceeds `maxRps`. */
  private async throttle() {
    const gap = 1000 / Math.max(this.options.maxRps, 0.1);
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + gap;
    if (slot > now) await this.sleep(slot - now);
  }

  private async once(url: string): Promise<FetchedDocument> {
    await this.throttle();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.options.userAgent ?? 'VoteInformed results-ingestor (+https://civicapi.org attribution)',
    };
    const etag = this.etags.get(url);
    if (etag) headers['If-None-Match'] = etag;
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.options.timeoutMs) });
    } catch (error) {
      throw new CivicApiError(`civicAPI ${new URL(url).pathname} failed: ${error instanceof Error ? error.message : error}`, null);
    }
    const fetchedAt = new Date().toISOString();
    if (response.status === 304) {
      return { providerKey: 'civicapi', fetchedAt, sourceUrl: url, payload: null, bytes: Buffer.alloc(0), httpStatus: 304, notModified: true, etag };
    }
    if (!response.ok) throw new CivicApiError(`civicAPI ${new URL(url).pathname} returned ${response.status}`, response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    let payload: unknown;
    try {
      payload = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new CivicApiError(`civicAPI ${new URL(url).pathname} returned a body that is not JSON`, response.status);
    }
    const nextEtag = response.headers.get('etag') ?? undefined;
    if (nextEtag) this.etags.set(url, nextEtag);
    return {
      providerKey: 'civicapi',
      fetchedAt,
      sourceUrl: url,
      contentType: response.headers.get('content-type') ?? 'application/json',
      etag: nextEtag,
      lastModified: response.headers.get('last-modified') ?? undefined,
      sha256: sha256(bytes),
      payload,
      bytes,
      httpStatus: response.status,
      notModified: false,
    };
  }

  /** GET `path` (`race/87528`), retried once on a timeout, network error or 5xx. */
  async get(path: string): Promise<FetchedDocument> {
    const url = this.url(path);
    try {
      return await this.once(url);
    } catch (error) {
      const retryable = error instanceof CivicApiError && (error.status === null || error.status >= 500);
      if (!retryable) throw error;
      await this.sleep(250 + Math.floor(Math.random() * 750));
      return this.once(url);
    }
  }
}
