/**
 * Goods imports by state of destination for one calendar year, from the Census International Trade
 * API (`timeseries/intltrade/imports/statehs`), for the tariff exposure score: all countries, and
 * China + Mexico + Canada. `GEN_VAL_YR` at December is the year's total, summed over HS2 chapters,
 * so the result never depends on a commodity total row. `STATE` is the state of destination on the
 * customs entry, not where goods are consumed; `XX` (unidentified) and territories are left out.
 * Public domain; uses CENSUS_API_KEY.
 */
import { Prisma, type PrismaClient } from '@prisma/client';

export const CENSUS_TRADE_SOURCE_KEY = 'census-trade';
export const TRADE_CATALOG_VERSION = 'census-statehs-v2';

/** The partners whose goods carry the 2025 tariffs on China, Mexico and Canada. Census country codes. */
export const PARTNERS = { china: '5700', mexico: '2010', canada: '1220' } as const;
/** Census's total-for-all-countries code. */
export const ALL_COUNTRIES = '-';

export type TradeFetch = (url: string) => Promise<unknown>;

/** `retryable`: a timeout, a dropped connection, 429 or a 5xx, worth asking again. */
export class CensusTradeError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = 'CensusTradeError';
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const tradeSeriesKey = (state: string, group: 'all' | 'cnmxca') => `census.imports.${group}.${state}`;

/** Census JSON: an array of rows, the first being the header. Returns value by state, summed. */
export function parseStateTotals(body: unknown, states: ReadonlySet<string>): Map<string, number> {
  if (!Array.isArray(body) || body.length === 0 || !Array.isArray(body[0])) throw new CensusTradeError('Census returned no table');
  const [header, ...rows] = body as unknown[][];
  const stateAt = header.indexOf('STATE');
  const valueAt = header.indexOf('GEN_VAL_YR');
  const levelAt = header.indexOf('COMM_LVL');
  if (stateAt < 0 || valueAt < 0) throw new CensusTradeError(`Census table lacks STATE or GEN_VAL_YR (got ${header.join(', ')})`);
  const totals = new Map<string, number>();
  for (const row of rows) {
    const state = String(row[stateAt] ?? '').trim().toUpperCase();
    if (!states.has(state)) continue;
    if (levelAt >= 0 && String(row[levelAt]) !== 'HS2') continue;
    const value = Number(row[valueAt]);
    if (!Number.isFinite(value) || value < 0) continue;
    totals.set(state, (totals.get(state) ?? 0) + value);
  }
  return totals;
}

export interface CensusTradeClientOptions {
  apiKey?: string;
  baseUrl: string;
  /** Replaces the HTTP request (tests). What it throws is retried, unless it is a non-retryable CensusTradeError. */
  fetchJson?: TradeFetch;
  /** Per request. Default 90 s. */
  timeoutMs?: number;
  /** Further attempts after a timeout, a dropped connection, 429 or a 5xx. Default 2. */
  retries?: number;
  /** Wait before the first retry, doubled for each one after. Default 5 s. */
  retryDelayMs?: number;
}

/**
 * Asks for one state at a time. The all-states query (every state x every HS2 chapter) did not
 * answer within 60 s on any run in Testing or production (Nov 1-2, 2026); one state is about a
 * fiftieth of it.
 */
export class CensusTradeClient {
  /** Requests made, retries included. */
  requestCount = 0;

  constructor(private readonly options: CensusTradeClientOptions) {}

  url(country: string, year: number, withKey = true, state?: string) {
    const params = new URLSearchParams({ get: 'STATE,GEN_VAL_YR,I_COMMODITY,COMM_LVL', COMM_LVL: 'HS2', time: `${year}-12`, CTY_CODE: country });
    if (state) params.set('STATE', state);
    if (withKey && this.options.apiKey) params.set('key', this.options.apiKey);
    return `${this.options.baseUrl.replace(/\/+$/, '')}/timeseries/intltrade/imports/statehs?${params}`;
  }

  private async request(url: string): Promise<unknown> {
    if (this.options.fetchJson) return this.options.fetchJson(url);
    let status: number;
    let text: string;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 90_000) });
      status = response.status;
      text = status === 204 ? '' : await response.text();
    } catch (error) {
      throw new CensusTradeError(`Census request failed: ${errorMessage(error)}`, true);
    }
    // Census answers 204 when a query matches nothing (a year not yet published, or no such imports).
    if (status === 204) return [];
    if (status < 200 || status >= 300) throw new CensusTradeError(`Census returned ${status}`, status === 429 || status >= 500);
    try {
      return JSON.parse(text);
    } catch {
      // A bad key gets an HTML page, not JSON.
      throw new CensusTradeError(`Census returned something other than JSON ("${text.slice(0, 80).replace(/\s+/g, ' ')}"); check CENSUS_API_KEY`);
    }
  }

  /** One state's imports from `country` in `year`, HS2 chapters summed; null when Census has no rows for it. */
  async stateTotal(country: string, year: number, state: string): Promise<number | null> {
    const url = this.url(country, year, true, state);
    const retries = this.options.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      this.requestCount++;
      try {
        const body = await this.request(url);
        if (Array.isArray(body) && body.length === 0) return null;
        return parseStateTotals(body, new Set([state])).get(state) ?? null;
      } catch (error) {
        const retryable = !(error instanceof CensusTradeError) || error.retryable;
        if (!retryable || attempt >= retries) throw error;
        await sleep((this.options.retryDelayMs ?? 5000) * 2 ** attempt);
      }
    }
  }
}

/** The latest calendar year Census has a December for: last year from March on, else the year before. */
export function defaultTradeYear(now: Date) {
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
}

export interface TradeSyncStats {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  year: number;
  /** States written. */
  states: number;
  /** States left out because a request still failed after its retries, each with its error. */
  failed: string[];
  /** Census requests made, retries included. */
  requests: number;
  error?: string;
}

/** Below this many states with all-country totals (or 40 with each partner), nothing is written. */
const MIN_STATES = 45;
const MIN_PARTNER_STATES = 40;

/**
 * Stores each state's total imports and China + Mexico + Canada imports for `year` as annual
 * observations, asking Census for one state at a time (four requests a state, `concurrency` states
 * at once). A state is written only when all four of its requests succeed, so a failed request is
 * never read as zero; it stays as it was until the next run. Writes nothing unless at least 45
 * states have totals and each partner has rows for at least 40 (a partial year, a changed country
 * code or response shape), and stops early once 45 can no longer be reached.
 */
export async function syncStateImports(db: PrismaClient, client: CensusTradeClient, states: readonly string[], options: { year?: number; now?: Date; sourceKey?: string; concurrency?: number } = {}): Promise<TradeSyncStats> {
  const now = options.now ?? new Date();
  const year = options.year ?? defaultTradeYear(now);
  const sourceKey = options.sourceKey ?? CENSUS_TRADE_SOURCE_KEY;
  await db.dataSource.createMany({
    skipDuplicates: true,
    data: {
      key: sourceKey, name: 'U.S. Census Bureau, International Trade', type: 'OFFICIAL_FEDERAL', authority: 'Census Bureau',
      homepageUrl: 'https://www.census.gov/foreign-trade/statistics/state/index.html',
      attributionText: 'Imports: U.S. Census Bureau, U.S. imports by state of destination (HS).',
      licenseName: 'Public domain (U.S. government work)', expectedCadenceSeconds: 30 * 24 * 3600,
      coverageDescription: 'Goods imports by state of destination: all countries, and China, Mexico and Canada.',
    },
  });
  const source = await db.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const run = await db.ingestionRun.create({
    data: { sourceId: source.id, status: 'RUNNING', parserVersion: TRADE_CATALOG_VERSION, startedAt: now, metadata: { year, perState: true, urls: [ALL_COUNTRIES, ...Object.values(PARTNERS)].map((code) => client.url(code, year, false)) } },
  });
  const minStates = Math.min(MIN_STATES, states.length);
  const failed: string[] = [];
  try {
    const found = new Map<string, { all: number; partners: Array<number | null> }>();
    let missing = 0;
    const queue = [...states];
    const worker = async () => {
      for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
        // Census is down, the key is bad, or the year is not out: stop rather than ask for every state.
        if (missing > states.length - minStates) return;
        try {
          const all = await client.stateTotal(ALL_COUNTRIES, year, state);
          if (all === null) {
            missing++;
            continue;
          }
          const partners: Array<number | null> = [];
          for (const code of Object.values(PARTNERS)) partners.push(await client.stateTotal(code, year, state));
          found.set(state, { all, partners });
        } catch (error) {
          missing++;
          failed.push(`${state}: ${errorMessage(error)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, states.length)) }, worker));

    const partnerStates = Object.values(PARTNERS).map((_, i) => [...found.values()].filter((item) => item.partners[i] !== null).length);
    if (found.size < minStates || partnerStates.some((count) => count < Math.min(MIN_PARTNER_STATES, states.length))) {
      const why = failed.length ? `; ${failed.length} states failed, first ${failed[0]}` : '';
      throw new CensusTradeError(`Census ${year} gave all-country totals for ${found.size} states and China/Mexico/Canada rows for ${partnerStates.join('/')}${why}; nothing written`);
    }
    const observedAt = new Date(Date.UTC(year, 0, 1));
    for (const state of states) {
      const item = found.get(state);
      if (!item) continue;
      // No rows from a partner (Census answers 204) is no imports from it.
      const cnmxca = item.partners.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      for (const [group, value, name] of [['all', item.all, 'Goods imports, all countries'], ['cnmxca', cnmxca, 'Goods imports from China, Mexico and Canada']] as const) {
        const series = await db.indicatorSeries.upsert({
          where: { key: tradeSeriesKey(state, group) },
          create: { key: tradeSeriesKey(state, group), name: `${name}, ${state}`, unit: 'Dollars', frequency: 'ANNUAL', sourceId: source.id, description: 'Census imports by state of destination, general imports, calendar year.' },
          update: {},
          select: { id: true },
        });
        await db.indicatorObservation.upsert({
          where: { seriesId_observedAt: { seriesId: series.id, observedAt } },
          create: { seriesId: series.id, observedAt, value: new Prisma.Decimal(value), fetchedAt: now },
          update: { value: new Prisma.Decimal(value), fetchedAt: now },
        });
      }
    }
    const status = failed.length ? 'PARTIAL' : 'SUCCEEDED';
    await db.ingestionRun.update({
      where: { id: run.id },
      data: { status, completedAt: new Date(), recordsFetched: client.requestCount, recordsAccepted: found.size, recordsRejected: failed.length, errorSummary: failed.length ? failed.join('; ').slice(0, 2000) : null },
    });
    await db.dataSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastSuccessfulAt: now, healthStatus: status === 'SUCCEEDED' ? 'CURRENT' : 'DEGRADED' } });
    return { status, year, states: found.size, failed, requests: client.requestCount };
  } catch (error) {
    const message = errorMessage(error);
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), recordsFetched: client.requestCount, errorSummary: message.slice(0, 2000) } });
    await db.dataSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, healthStatus: 'DEGRADED' } });
    return { status: 'FAILED', year, states: 0, failed, requests: client.requestCount, error: message };
  }
}
