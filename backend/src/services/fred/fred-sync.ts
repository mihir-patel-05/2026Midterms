/**
 * Loads FRED economic indicators into indicator_series and indicator_observations.
 *
 * A series with no stored rows backfills 5 years. Later runs re-fetch the last
 * 400 days, which catches revisions to GDP and payrolls and the annual CPI
 * seasonal-factor update. New rows are inserted, and a stored row is updated
 * only when its value changed, so re-running is cheap and leaves fetched_at
 * meaning "when this value was last seen to change".
 *
 * One failing series is recorded and the run moves on: the run ends PARTIAL and
 * the source DEGRADED, and the series keeps its last good rows.
 *
 * No RawArtifact yet: its storage is still the local filesystem, which a Railway
 * redeploy wipes. The request URLs (without the key) go in the run's metadata.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FredClient, FredObservation } from './fred-client.js';
import { FRED_CATALOG_VERSION, FRED_SERIES, FRED_SOURCE_KEY, type FredSeriesDef } from './series-catalog.js';

const BACKFILL_YEARS = 5;
const REFETCH_DAYS = 400;
const INSERT_BATCH = 1000;
const UPDATE_BATCH = 250;
const DAY_MS = 24 * 60 * 60 * 1000;
const COVERAGE = 'National economic indicators (GDP, oil, gasoline, inflation, jobs, interest rates, Treasury yields, real income, '
  + 'consumer sentiment, and home prices), and for the 50 states and DC: unemployment, payrolls, jobless claims, real GDP, and home prices.';

export interface FredSeriesStats {
  fredId: string;
  sourceUrl: string;
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  error?: string;
}

export interface FredSyncStats {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  series: FredSeriesStats[];
  failures: number;
  requests: number;
}

export interface FredSyncOptions {
  catalog?: readonly FredSeriesDef[];
  /** Tests use their own source so they never touch real rows. */
  sourceKey?: string;
  now?: Date;
  log?: (message: string) => void;
}

export async function syncFred(db: PrismaClient, client: FredClient, options: FredSyncOptions = {}): Promise<FredSyncStats> {
  const { catalog = FRED_SERIES, sourceKey = FRED_SOURCE_KEY, now = new Date(), log = console.log } = options;
  // Insert-if-absent rather than upsert, so two syncs starting together cannot race on the key.
  await db.dataSource.createMany({
    skipDuplicates: true,
    data: {
      key: sourceKey,
      name: 'FRED, Federal Reserve Economic Data',
      type: 'OFFICIAL_FEDERAL',
      authority: 'Federal Reserve Bank of St. Louis',
      homepageUrl: 'https://fred.stlouisfed.org',
      attributionText: 'Economic data via FRED (Federal Reserve Bank of St. Louis). Each series is published by its original source.',
      licenseName: 'FRED terms of use; the original source\'s terms apply to each series',
      licenseUrl: 'https://fred.stlouisfed.org/legal/',
      coverageDescription: COVERAGE,
      expectedCadenceSeconds: 12 * 60 * 60,
      isEnabled: true,
    },
  });
  // The coverage text is set here too, so a source created by an older catalog picks up the new one.
  const source = await db.dataSource.update({ where: { key: sourceKey }, data: { lastCheckedAt: now, coverageDescription: COVERAGE } });
  const run = await db.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: 'RUNNING',
      parserVersion: FRED_CATALOG_VERSION,
      startedAt: now,
      metadata: { series: catalog.map((def) => def.fredId) },
    },
  });

  const stats: FredSeriesStats[] = [];
  for (const def of catalog) {
    const series = await db.indicatorSeries.upsert({
      where: { key: def.key },
      update: { name: def.name, unit: def.unit, frequency: def.frequency, sourceId: source.id },
      create: { key: def.key, name: def.name, unit: def.unit, frequency: def.frequency, description: `${def.fredId} from ${def.originalSource}`, sourceId: source.id },
    });
    const latest = await db.indicatorObservation.findFirst({ where: { seriesId: series.id }, orderBy: { observedAt: 'desc' }, select: { observedAt: true } });
    const start = latest ? isoDate(new Date(now.getTime() - REFETCH_DAYS * DAY_MS)) : isoDate(addYears(now, -BACKFILL_YEARS));
    const result: FredSeriesStats = { fredId: def.fredId, sourceUrl: client.redactedUrl(def.fredId, start), fetched: 0, inserted: 0, updated: 0, unchanged: 0 };
    try {
      const observations = await client.getObservations(def.fredId, start);
      result.fetched = observations.length;
      Object.assign(result, await store(db, series.id, observations, new Date()));
      log(`  ${def.fredId}: ${result.fetched} fetched, ${result.inserted} new, ${result.updated} revised`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      log(`  ${def.fredId}: failed, ${result.error}`);
    }
    stats.push(result);
  }

  const failures = stats.filter((series) => series.error);
  const status: FredSyncStats['status'] = failures.length === 0 ? 'SUCCEEDED' : failures.length < stats.length ? 'PARTIAL' : 'FAILED';
  const completedAt = new Date();
  await db.ingestionRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt,
      recordsFetched: sum(stats, 'fetched'),
      recordsAccepted: sum(stats, 'inserted') + sum(stats, 'updated'),
      recordsRejected: 0,
      errorSummary: failures.length ? failures.map((series) => `${series.fredId}: ${series.error}`).join('; ').slice(0, 2000) : null,
      metadata: { series: stats } as unknown as Prisma.InputJsonValue,
    },
  });
  await db.dataSource.update({
    where: { id: source.id },
    data: status === 'SUCCEEDED' ? { healthStatus: 'CURRENT', lastSuccessfulAt: completedAt } : { healthStatus: 'DEGRADED' },
  });
  return { status, series: stats, failures: failures.length, requests: client.requestCount };
}

/** Insert new observations and update the ones whose value changed. */
async function store(db: PrismaClient, seriesId: string, observations: FredObservation[], fetchedAt: Date) {
  if (observations.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };
  // From the earliest date returned, not the requested start: FRED may include the period containing it.
  const earliest = observations.reduce((min, observation) => (observation.date < min ? observation.date : min), observations[0].date);
  const stored = await db.indicatorObservation.findMany({
    where: { seriesId, observedAt: { gte: new Date(`${earliest}T00:00:00Z`) } },
    select: { id: true, observedAt: true, value: true },
  });
  const byDate = new Map(stored.map((row) => [isoDate(row.observedAt), row]));
  const inserts: Prisma.IndicatorObservationCreateManyInput[] = [];
  const updates: Array<{ id: string; value: Prisma.Decimal }> = [];
  for (const observation of observations) {
    // The column is DECIMAL(18,6); compare at that precision so an unchanged value is not rewritten.
    const value = new Prisma.Decimal(observation.value).toDecimalPlaces(6);
    const existing = byDate.get(observation.date);
    if (!existing) inserts.push({ seriesId, observedAt: new Date(`${observation.date}T00:00:00Z`), value, fetchedAt });
    else if (!existing.value.equals(value)) updates.push({ id: existing.id, value });
  }
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += INSERT_BATCH) {
    inserted += (await db.indicatorObservation.createMany({ data: inserts.slice(i, i + INSERT_BATCH), skipDuplicates: true })).count;
  }
  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    await db.$transaction(updates.slice(i, i + UPDATE_BATCH).map(({ id, value }) =>
      db.indicatorObservation.update({ where: { id }, data: { value, fetchedAt } })));
  }
  return { inserted, updated: updates.length, unchanged: observations.length - inserted - updates.length };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(date: Date, years: number): Date {
  const shifted = new Date(date);
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted;
}

function sum(stats: FredSeriesStats[], field: 'fetched' | 'inserted' | 'updated'): number {
  return stats.reduce((total, series) => total + series[field], 0);
}
