/**
 * FRED API client for series observations.
 *
 * FRED writes a missing value as "." (a holiday for a daily series, or a
 * period not yet published). Those become no row, never 0.
 *
 * The API key is a query parameter, so request URLs are never logged or stored;
 * `redactedUrl` gives the same URL without it. Requests run one at a time, far
 * below FRED's limit of 120 per minute.
 */

export interface FredObservation {
  /** YYYY-MM-DD, the start of the period FRED dates the value to. */
  date: string;
  value: number;
}

export interface FredClientOptions {
  apiKey?: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  retryDelayMs?: number;
}

/** Parse `/series/observations` JSON, dropping FRED's "." missing values. */
export function parseObservations(body: unknown): FredObservation[] {
  const observations = (body as { observations?: unknown })?.observations;
  if (!Array.isArray(observations)) throw new FredRequestError('FRED response has no observations array');
  const rows: FredObservation[] = [];
  for (const raw of observations as Array<{ date?: unknown; value?: unknown }>) {
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue;
    if (typeof raw.value !== 'string' || raw.value.trim() === '' || raw.value === '.') continue;
    const value = Number(raw.value);
    if (!Number.isFinite(value)) continue;
    rows.push({ date: raw.date, value });
  }
  return rows;
}

export class FredClient {
  readonly observationsUrl: string;
  requestCount = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly options: FredClientOptions) {
    this.observationsUrl = `${options.baseUrl.replace(/\/$/, '')}/series/observations`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
  }

  /** The request URL without the API key, safe to log or store. */
  redactedUrl(fredId: string, start: string): string {
    const params = new URLSearchParams({ series_id: fredId, observation_start: start, file_type: 'json' });
    return `${this.observationsUrl}?${params.toString()}`;
  }

  /** Observations from `start` (YYYY-MM-DD) to the latest, oldest first. */
  async getObservations(fredId: string, start: string): Promise<FredObservation[]> {
    const safeUrl = this.redactedUrl(fredId, start);
    const url = this.options.apiKey ? `${safeUrl}&api_key=${encodeURIComponent(this.options.apiKey)}` : safeUrl;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      this.requestCount++;
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: 'application/json', 'User-Agent': 'VoteInformed-FRED-sync/1.0 (+https://github.com/mihir-patel-05/2026Midterms)' },
        });
        const text = await response.text();
        if (response.ok) {
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            throw new FredRequestError(`FRED returned a non-JSON response for ${fredId} (HTTP ${response.status})`);
          }
          return parseObservations(body);
        }
        const message = `FRED API ${response.status} for ${fredId}: ${errorMessage(text)}`;
        // Client errors (unknown series, bad key) will not succeed on retry.
        if (response.status < 500 && response.status !== 429) throw new FredRequestError(message);
        lastError = new Error(message);
      } catch (error) {
        if (error instanceof FredRequestError) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

/** FRED errors are JSON (`{ error_code, error_message }`); fall back to the raw text. */
function errorMessage(text: string): string {
  try {
    const body = JSON.parse(text) as { error_message?: unknown };
    if (typeof body.error_message === 'string') return body.error_message;
  } catch {
    // Not JSON.
  }
  return text.slice(0, 200);
}

export class FredRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FredRequestError';
  }
}
