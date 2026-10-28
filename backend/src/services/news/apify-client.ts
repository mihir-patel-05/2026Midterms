/**
 * Runs a Google News search actor on Apify and returns its dataset items.
 *
 * The actor is configuration, never code: APIFY_NEWS_ACTOR_ID picks it, and
 * APIFY_NEWS_INPUT_JSON adjusts the input for actors whose fields differ from
 * the default shape (see buildActorInput). Runs are asynchronous: start, wait,
 * then read the default dataset. The synchronous endpoint gives up after 300
 * seconds and loses the run.
 *
 * Every run caps its own cost with maxItems (pay per result) and
 * maxTotalChargeUsd (pay per event), so a bug here cannot spend past the budget.
 */
import { ApifyClient } from 'apify-client';

export interface NewsSearchRequest {
  queries: string[];
  maxItemsPerQuery: number;
  /** Charged results across all queries. */
  maxItems: number;
  /** Most this run may cost, in USD. */
  maxChargeUsd: number;
}

export interface NewsSearchResult {
  items: unknown[];
  actorId: string;
  runId: string;
  status: string;
  /** What Apify billed for the run, when it reports it. */
  costUsd: number | null;
}

/** The part of a search source that the sync needs; tests pass a fake. */
export interface NewsSearchClient {
  readonly actorId: string;
  search(request: NewsSearchRequest): Promise<NewsSearchResult>;
}

export class NewsSearchError extends Error {
  constructor(message: string, readonly runId?: string) {
    super(message);
    this.name = 'NewsSearchError';
  }
}

/** Placeholder in APIFY_NEWS_INPUT_JSON that becomes the query list. */
export const QUERIES_PLACEHOLDER = '$QUERIES';

/**
 * The actor input. The default fields match the common Google News actors
 * (`queries`, `timeframe`, `maxItems`, `language`, `country`, `decodeUrls`).
 * `overrides` is merged on top: a null value removes a field, and the string
 * "$QUERIES" is replaced by the query list, so an actor that calls the field
 * `searchTerms` takes `{"queries": null, "searchTerms": "$QUERIES"}`.
 */
export function buildActorInput(request: NewsSearchRequest, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const input: Record<string, unknown> = {
    queries: request.queries,
    timeframe: '1d',
    maxItems: request.maxItems,
    maxItemsPerQuery: request.maxItemsPerQuery,
    language: 'en',
    country: 'US',
    decodeUrls: true,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete input[key];
    else input[key] = value === QUERIES_PLACEHOLDER ? request.queries : value;
  }
  return input;
}

/** Parses APIFY_NEWS_INPUT_JSON; anything but a JSON object is a configuration error. */
export function parseInputOverrides(json: string | undefined): Record<string, unknown> {
  if (!json?.trim()) return {};
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('APIFY_NEWS_INPUT_JSON must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export interface ApifyNewsClientOptions {
  token: string;
  actorId: string;
  inputOverrides?: Record<string, unknown>;
  /** How long to wait for the run before aborting it. */
  waitSecs?: number;
}

export class ApifyNewsClient implements NewsSearchClient {
  readonly actorId: string;
  private readonly client: ApifyClient;
  private readonly overrides: Record<string, unknown>;
  private readonly waitSecs: number;

  constructor(options: ApifyNewsClientOptions) {
    this.actorId = options.actorId;
    this.client = new ApifyClient({ token: options.token });
    this.overrides = options.inputOverrides ?? {};
    this.waitSecs = options.waitSecs ?? 600;
  }

  async search(request: NewsSearchRequest): Promise<NewsSearchResult> {
    const started = await this.client.actor(this.actorId).start(buildActorInput(request, this.overrides), {
      maxItems: request.maxItems,
      maxTotalChargeUsd: request.maxChargeUsd,
    });
    const run = await this.client.run(started.id).waitForFinish({ waitSecs: this.waitSecs });
    if (run.status === 'READY' || run.status === 'RUNNING') {
      await this.client.run(run.id).abort().catch(() => {});
      throw new NewsSearchError(`Apify run ${run.id} was still running after ${this.waitSecs}s and was aborted`, run.id);
    }
    // A run that timed out keeps the items it saved, and they were paid for.
    if (run.status !== 'SUCCEEDED' && run.status !== 'TIMED-OUT') {
      throw new NewsSearchError(`Apify run ${run.id} ended ${run.status}`, run.id);
    }
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems({ limit: request.maxItems, clean: true });
    return {
      items,
      actorId: this.actorId,
      runId: run.id,
      status: run.status,
      costUsd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null,
    };
  }
}
