/**
 * Read model for GET /api/indicators: every served FRED series with its latest
 * value, change, staleness, source line, and history.
 */
import type { PrismaClient } from '@prisma/client';
import { buildIndicator, servedSeries, type IndicatorView } from './indicator-math.js';
import { FRED_SERIES, FRED_SOURCE_KEY, nationalSeries, type FredSeriesDef } from './series-catalog.js';

/** Extra history read before the window so the first shown point has a year-over-year change. */
const LOOKBACK_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

export class IndicatorsNotLoadedError extends Error {
  constructor() {
    super('Economic indicators have not been loaded yet. Run `npm run sync:fred`.');
    this.name = 'IndicatorsNotLoadedError';
  }
}

export interface IndicatorsResponse {
  asOf: string;
  days: number;
  attribution: string;
  series: IndicatorView[];
}

export async function getIndicators(
  db: PrismaClient,
  options: { days: number; includeRestricted: boolean; now?: Date; catalog?: readonly FredSeriesDef[] },
): Promise<IndicatorsResponse> {
  const { days, includeRestricted, now = new Date(), catalog = FRED_SERIES } = options;
  const defs = servedSeries(nationalSeries(catalog), includeRestricted);
  const since = new Date(now.getTime() - days * DAY_MS);
  const readFrom = new Date(since.getTime() - LOOKBACK_DAYS * DAY_MS);

  const [source, rows] = await Promise.all([
    db.dataSource.findUnique({ where: { key: FRED_SOURCE_KEY }, select: { attributionText: true, lastSuccessfulAt: true } }),
    db.indicatorSeries.findMany({
      where: { key: { in: defs.map((def) => def.key) } },
      select: {
        key: true,
        observations: {
          where: { observedAt: { gte: readFrom } },
          orderBy: { observedAt: 'asc' },
          select: { observedAt: true, value: true, fetchedAt: true },
        },
      },
    }),
  ]);
  if (!rows.some((row) => row.observations.length > 0)) throw new IndicatorsNotLoadedError();

  const byKey = new Map(rows.map((row) => [row.key, row.observations]));
  const sinceDate = since.toISOString().slice(0, 10);
  const series = defs.map((def) => {
    const observations = byKey.get(def.key) ?? [];
    // fetched_at only moves when a value changes, so the source's last clean run is usually later.
    const fetchedAt = [source?.lastSuccessfulAt, ...observations.map((row) => row.fetchedAt)]
      .filter((date): date is Date => date instanceof Date)
      .reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null);
    const points = observations.map((row) => ({ date: row.observedAt.toISOString().slice(0, 10), value: row.value.toNumber() }));
    return buildIndicator(def, points, { since: sinceDate, now, fetchedAt });
  });

  return {
    asOf: now.toISOString(),
    days,
    attribution: source?.attributionText ?? 'Economic data via FRED (Federal Reserve Bank of St. Louis).',
    series,
  };
}
