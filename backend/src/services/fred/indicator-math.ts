/**
 * Pure helpers for serving indicators: changes computed from stored levels,
 * staleness, period labels, and thinning daily history for small charts.
 *
 * Dates are YYYY-MM-DD strings in UTC. FRED dates a monthly value to the 1st of
 * the month and a quarterly value to the 1st of the quarter, but a weekly value
 * to the last day of its week (claims end on Saturday, gas on Monday, mortgage
 * rates on Thursday).
 */
import type { IndicatorFrequency } from '@prisma/client';
import type { FredSeriesDef, IndicatorTransform } from './series-catalog.js';

export interface Point {
  date: string;
  value: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days after a period ends before its series counts as stale. Measured from the
 * end of the period, not from the date FRED gives it: September CPI is dated
 * Sep 1 but published mid-October. Monthly allows 75 days because FRED shows
 * consumer sentiment about a month late, after BEA's end-of-month releases.
 */
export const STALE_AFTER_DAYS: Record<IndicatorFrequency, number> = { DAILY: 7, WEEKLY: 14, MONTHLY: 75, QUARTERLY: 150 };

/** How far from the exact date a year earlier an observation may be and still count. */
const YEAR_AGO_TOLERANCE_DAYS: Record<IndicatorFrequency, number> = { DAILY: 4, WEEKLY: 4, MONTHLY: 3, QUARTERLY: 3 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

/** The day after the period FRED dates to `date` ends (exclusive end). */
export function periodEnd(date: string, frequency: IndicatorFrequency): Date {
  const start = toDate(date);
  switch (frequency) {
    case 'DAILY':
    case 'WEEKLY': return new Date(start.getTime() + DAY_MS);
    case 'MONTHLY': return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    case 'QUARTERLY': return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1));
  }
}

export function isStale(latestDate: string, frequency: IndicatorFrequency, now: Date, staleAfterDays = STALE_AFTER_DAYS[frequency]): boolean {
  return now.getTime() - periodEnd(latestDate, frequency).getTime() > staleAfterDays * DAY_MS;
}

/** The observation nearest to one year before `points[index]`, within tolerance. */
function yearAgo(points: Point[], index: number, frequency: IndicatorFrequency): Point | null {
  const target = toDate(points[index].date);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const tolerance = YEAR_AGO_TOLERANCE_DAYS[frequency] * DAY_MS;
  let best: Point | null = null;
  let bestGap = Infinity;
  for (let i = index - 1; i >= 0; i--) {
    const gap = toDate(points[i].date).getTime() - target.getTime();
    if (gap < -tolerance) break;
    if (Math.abs(gap) <= tolerance && Math.abs(gap) < bestGap) {
      best = points[i];
      bestGap = Math.abs(gap);
    }
  }
  return best;
}

/** Percent change from a year earlier, or null when that observation is missing. */
export function yoyPercent(points: Point[], index: number, frequency: IndicatorFrequency): number | null {
  const prior = yearAgo(points, index, frequency);
  if (!prior || prior.value === 0) return null;
  return (points[index].value / prior.value - 1) * 100;
}

/** Difference from the previous observation (payrolls: jobs added). */
export function priorChange(points: Point[], index: number): number | null {
  return index > 0 ? points[index].value - points[index - 1].value : null;
}

/**
 * Percent change from the prior quarter at an annual rate, as BEA reports GDP
 * growth. Null unless the previous observation is exactly the prior quarter, so
 * a missing quarter never shows as a half-year compressed into one.
 */
export function qoqAnnualized(points: Point[], index: number): number | null {
  if (index <= 0) return null;
  const current = toDate(points[index].date);
  const prior = points[index - 1];
  const expected = toIso(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 3, 1)));
  if (prior.date !== expected || prior.value <= 0 || points[index].value <= 0) return null;
  return ((points[index].value / prior.value) ** 4 - 1) * 100;
}

/**
 * The change shown for a series. `yoy` series show the percent change from a
 * year ago; `qoq_annualized` series the annualized change from the prior
 * quarter; `level` and `mom_change` series the difference from the previous
 * observation.
 */
export function changeAt(points: Point[], index: number, def: Pick<FredSeriesDef, 'transform' | 'frequency'>): number | null {
  switch (def.transform) {
    case 'yoy': return yoyPercent(points, index, def.frequency);
    case 'qoq_annualized': return qoqAnnualized(points, index);
    case 'level':
    case 'mom_change': return priorChange(points, index);
  }
}

/** The Monday of the ISO week containing `date`. */
function weekStart(date: string): string {
  const day = toDate(date);
  return toIso(new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS));
}

/** Keep the last observation in each week, so daily series chart at weekly resolution. */
export function weeklyReduce<T extends { date: string }>(points: T[]): T[] {
  const reduced: T[] = [];
  for (const point of points) {
    if (reduced.length && weekStart(reduced[reduced.length - 1].date) === weekStart(point.date)) reduced[reduced.length - 1] = point;
    else reduced.push(point);
  }
  return reduced;
}

/** "Oct 14", "Week ending Oct 10", "Aug 2026", or "Q2 2026". */
export function periodLabel(date: string, frequency: IndicatorFrequency): string {
  const day = toDate(date);
  const month = MONTHS[day.getUTCMonth()];
  switch (frequency) {
    case 'DAILY': return `${month} ${day.getUTCDate()}`;
    case 'WEEKLY': return `Week ending ${month} ${day.getUTCDate()}`;
    case 'MONTHLY': return `${month} ${day.getUTCFullYear()}`;
    case 'QUARTERLY': return `Q${Math.floor(day.getUTCMonth() / 3) + 1} ${day.getUTCFullYear()}`;
  }
}

/** "BLS via FRED, fetched Oct 15". */
export function sourceLine(originalSource: string, fetchedAt: Date): string {
  const eastern = fetchedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return `${originalSource} via FRED, fetched ${eastern}`;
}

/** Series served by the API: restricted ones only when their flag is on. */
export function servedSeries<T extends Pick<FredSeriesDef, 'restricted'>>(catalog: readonly T[], includeRestricted: boolean): T[] {
  return catalog.filter((def) => includeRestricted || !def.restricted);
}

export interface IndicatorView {
  key: string;
  fredId: string;
  name: string;
  unit: string;
  frequency: IndicatorFrequency;
  transform: IndicatorTransform;
  originalSource: string;
  /** Postal code for a state series; null for a national one. */
  stateCode: string | null;
  latest: { date: string; value: number; period: string } | null;
  /** See `changeAt`. Null when the observation it needs is missing. */
  change: number | null;
  stale: boolean;
  fetchedAt: string | null;
  sourceLine: string | null;
  /** Stored levels; daily series reduced to one value per week. */
  history: Array<[date: string, value: number]>;
  /** `changeAt` for each history point; null for level series. */
  changeHistory: Array<[date: string, value: number]> | null;
}

/**
 * Build the served view of one series. `points` must be sorted oldest first and
 * may start before `since`: the extra year lets every shown point have a
 * year-over-year change.
 */
export function buildIndicator(
  def: FredSeriesDef,
  points: Point[],
  options: { since: string; now: Date; fetchedAt: Date | null },
): IndicatorView {
  const last = points.length - 1;
  const latest = last >= 0 ? points[last] : null;
  const shownIndexes = points.map((_, i) => i).filter((i) => points[i].date >= options.since);
  const thin = <T extends { date: string }>(rows: T[]) => (def.frequency === 'DAILY' ? weeklyReduce(rows) : rows);
  const history = thin(shownIndexes.map((i) => points[i])).map((point): [string, number] => [point.date, point.value]);
  const changeHistory = def.transform === 'level'
    ? null
    : thin(shownIndexes.map((i) => ({ date: points[i].date, value: changeAt(points, i, def) })))
      .filter((point): point is Point => point.value !== null)
      .map((point): [string, number] => [point.date, point.value]);
  return {
    key: def.key,
    fredId: def.fredId,
    name: def.name,
    unit: def.unit,
    frequency: def.frequency,
    transform: def.transform,
    originalSource: def.originalSource,
    stateCode: def.stateCode,
    latest: latest ? { date: latest.date, value: latest.value, period: periodLabel(latest.date, def.frequency) } : null,
    change: latest ? changeAt(points, last, def) : null,
    stale: latest ? isStale(latest.date, def.frequency, options.now, def.staleAfterDays) : true,
    fetchedAt: options.fetchedAt?.toISOString() ?? null,
    sourceLine: options.fetchedAt ? sourceLine(def.originalSource, options.fetchedAt) : null,
    history,
    changeHistory,
  };
}
