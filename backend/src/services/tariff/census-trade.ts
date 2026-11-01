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
export const TRADE_CATALOG_VERSION = 'census-statehs-v1';

/** The partners whose goods carry the 2025 tariffs on China, Mexico and Canada. Census country codes. */
export const PARTNERS = { china: '5700', mexico: '2010', canada: '1220' } as const;
/** Census's total-for-all-countries code. */
export const ALL_COUNTRIES = '-';

export type TradeFetch = (url: string) => Promise<unknown>;
export class CensusTradeError extends Error {}

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

export class CensusTradeClient {
  constructor(private readonly options: { apiKey?: string; baseUrl: string; fetchJson?: TradeFetch; timeoutMs?: number }) {}

  url(country: string, year: number, withKey = true) {
    const params = new URLSearchParams({ get: 'STATE,GEN_VAL_YR,I_COMMODITY,COMM_LVL', COMM_LVL: 'HS2', time: `${year}-12`, CTY_CODE: country });
    if (withKey && this.options.apiKey) params.set('key', this.options.apiKey);
    return `${this.options.baseUrl.replace(/\/+$/, '')}/timeseries/intltrade/imports/statehs?${params}`;
  }

  async stateTotals(country: string, year: number, states: ReadonlySet<string>): Promise<Map<string, number>> {
    const url = this.url(country, year);
    const body = this.options.fetchJson
      ? await this.options.fetchJson(url)
      : await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000) }).then(async (response) => {
        // Census answers 204 when a query matches nothing (a year not yet published).
        if (response.status === 204) return [];
        if (!response.ok) throw new CensusTradeError(`Census statehs ${country} ${year} returned ${response.status}`);
        return response.json();
      });
    if (Array.isArray(body) && body.length === 0) return new Map();
    return parseStateTotals(body, states);
  }
}

/** The latest calendar year Census has a December for: last year from March on, else the year before. */
export function defaultTradeYear(now: Date) {
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
}

export interface TradeSyncStats {
  status: 'SUCCEEDED' | 'FAILED';
  year: number;
  states: number;
  error?: string;
}

/**
 * Stores each state's total imports and China + Mexico + Canada imports for `year` as annual
 * observations. Writes nothing unless both totals cover at least 45 states (a partial year or a
 * changed response shape).
 */
export async function syncStateImports(db: PrismaClient, client: CensusTradeClient, states: readonly string[], options: { year?: number; now?: Date; sourceKey?: string } = {}): Promise<TradeSyncStats> {
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
    data: { sourceId: source.id, status: 'RUNNING', parserVersion: TRADE_CATALOG_VERSION, startedAt: now, metadata: { year, urls: [ALL_COUNTRIES, ...Object.values(PARTNERS)].map((code) => client.url(code, year, false)) } },
  });
  const wanted = new Set(states);
  try {
    const all = await client.stateTotals(ALL_COUNTRIES, year, wanted);
    const partners = await Promise.all(Object.values(PARTNERS).map((code) => client.stateTotals(code, year, wanted)));
    const covered = (totals: Map<string, number>) => totals.size >= Math.min(45, states.length);
    if (!covered(all) || partners.some((totals) => totals.size < Math.min(40, states.length))) {
      throw new CensusTradeError(`Census ${year} covers ${all.size} states for all countries and ${partners.map((totals) => totals.size).join('/')} for China/Mexico/Canada; nothing written`);
    }
    const observedAt = new Date(Date.UTC(year, 0, 1));
    for (const state of states) {
      const total = all.get(state);
      if (total === undefined) continue;
      const cnmxca = partners.reduce((sum, totals) => sum + (totals.get(state) ?? 0), 0);
      for (const [group, value, name] of [['all', total, 'Goods imports, all countries'], ['cnmxca', cnmxca, 'Goods imports from China, Mexico and Canada']] as const) {
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
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), recordsFetched: 4, recordsAccepted: all.size } });
    await db.dataSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, lastSuccessfulAt: now, healthStatus: 'CURRENT' } });
    return { status: 'SUCCEEDED', year, states: all.size };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), errorSummary: message.slice(0, 2000) } });
    await db.dataSource.update({ where: { id: source.id }, data: { lastCheckedAt: now, healthStatus: 'DEGRADED' } });
    return { status: 'FAILED', year, states: 0, error: message };
  }
}
