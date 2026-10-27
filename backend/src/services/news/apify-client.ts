/**
 * A small client for the Apify REST API: start an actor run, wait for it, and read
 * its dataset.
 *
 * Runs are asynchronous. Apify's synchronous endpoint returns HTTP 408 after 300
 * seconds and loses the run, so this starts the run, polls it, and aborts it if it
 * outlives `pollTimeoutMs`. Every run carries `maxItems` and `maxTotalChargeUsd`, so
 * Apify itself stops charging at the budget. The token goes in a header and never
 * appears in a URL, a log line, or an error message.
 */

export interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string | null;
  /** What Apify charged for the run, when it reports it. */
  usageTotalUsd: number | null;
}

export interface ApifyRunResult {
  run: ApifyRun;
  items: unknown[];
  /** True when the run outlived the poll timeout and was aborted. */
  aborted: boolean;
}

export interface ApifyRunLimits {
  maxItems: number;
  maxChargeUsd: number;
  /** Apify stops the run after this many seconds. */
  timeoutSecs?: number;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ApifyClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** How long to wait for a run before aborting it. */
  pollTimeoutMs?: number;
  /** Apify's first figures after a run ends can be preliminary; wait this long and read the run again. */
  settleMs?: number;
  /** Retries for GET requests on a network error, HTTP 429, or 5xx. Starting a run is never retried. */
  retries?: number;
  retryDelayMs?: number;
  clock?: Clock;
}

/** How long an aborted run may take to stop before the client gives up on it. */
const ABORT_GRACE_MS = 2 * 60_000;

export const TERMINAL_RUN_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

export class ApifyRequestError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = 'ApifyRequestError';
  }
}

/** "tacps126/google-news" → "tacps126~google-news", the form Apify's URLs use. */
export function actorPathId(actorId: string): string {
  return encodeURIComponent(actorId.trim().replace('/', '~'));
}

export function parseRun(body: unknown): ApifyRun {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data.id !== 'string' || typeof data.status !== 'string') {
    throw new ApifyRequestError('Apify response has no run');
  }
  const usage = data.usageTotalUsd;
  return {
    id: data.id,
    status: data.status,
    defaultDatasetId: typeof data.defaultDatasetId === 'string' ? data.defaultDatasetId : null,
    usageTotalUsd: typeof usage === 'number' && Number.isFinite(usage) ? usage : null,
  };
}

export class ApifyClient {
  requestCount = 0;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollTimeoutMs: number;
  private readonly settleMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly clock: Clock;

  constructor(options: ApifyClientOptions) {
    if (!options.token.trim()) throw new ApifyRequestError('An Apify token is required');
    this.token = options.token.trim();
    this.baseUrl = (options.baseUrl ?? 'https://api.apify.com/v2').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 10 * 60_000;
    this.settleMs = options.settleMs ?? 5_000;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 2_000;
    this.clock = options.clock ?? realClock;
  }

  /** Start a run, wait for it to end, and read its dataset. */
  async runActor(actorId: string, input: Record<string, unknown>, limits: ApifyRunLimits): Promise<ApifyRunResult> {
    const query = new URLSearchParams({
      maxItems: String(limits.maxItems),
      maxTotalChargeUsd: limits.maxChargeUsd.toFixed(2),
      timeout: String(limits.timeoutSecs ?? 300),
    });
    let run = parseRun(await this.request('POST', `/acts/${actorPathId(actorId)}/runs?${query}`, input));
    const deadline = this.clock.now() + this.pollTimeoutMs;
    let aborted = false;
    while (!TERMINAL_RUN_STATUSES.has(run.status)) {
      if (!aborted && this.clock.now() >= deadline) {
        run = parseRun(await this.request('POST', `/actor-runs/${encodeURIComponent(run.id)}/abort`));
        aborted = true;
        continue;
      }
      if (aborted && this.clock.now() >= deadline + ABORT_GRACE_MS) {
        throw new ApifyRequestError(`Apify run ${run.id} did not stop after it was aborted`);
      }
      run = parseRun(await this.request('GET', `/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=60`));
    }
    if (this.settleMs > 0) await this.clock.sleep(this.settleMs);
    run = parseRun(await this.request('GET', `/actor-runs/${encodeURIComponent(run.id)}`));
    const items = run.defaultDatasetId ? await this.datasetItems(run.defaultDatasetId, limits.maxItems) : [];
    return { run, items, aborted };
  }

  private async datasetItems(datasetId: string, limit: number): Promise<unknown[]> {
    const query = new URLSearchParams({ clean: 'true', format: 'json', limit: String(limit) });
    const body = await this.request('GET', `/datasets/${encodeURIComponent(datasetId)}/items?${query}`);
    if (!Array.isArray(body)) throw new ApifyRequestError('Apify dataset response is not a list');
    return body;
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const attempts = method === 'GET' ? this.retries + 1 : 1;
    let lastError: ApifyRequestError | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await this.clock.sleep(this.retryDelayMs * attempt);
      this.requestCount += 1;
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        lastError = new ApifyRequestError(`Apify request failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (response.ok) return response.json();
      const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      lastError = new ApifyRequestError(`Apify ${method} ${path.split('?')[0]} returned HTTP ${response.status}${detail?.error?.message ? `: ${detail.error.message}` : ''}`, response.status);
      if (response.status !== 429 && response.status < 500) break;
    }
    throw lastError ?? new ApifyRequestError('Apify request failed');
  }
}
