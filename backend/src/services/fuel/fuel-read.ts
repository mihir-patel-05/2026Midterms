/**
 * A state's fuel prices for the Cost of living tab (PLAN.md §4.8): the latest week, the gap to the
 * U.S., changes over the same fixed windows for every state (1 week, about 1 month, about 1 year),
 * and two years of history beside the U.S. A missing comparison week gives null, never zero.
 */
import type { PrismaClient } from '@prisma/client';
import { AREAS, areaForState, EIA_SOURCE_KEY, seriesKey, type Fuel, type FuelArea } from './fuel-catalog.js';

const DAY = 24 * 3600 * 1000;
const HISTORY_DAYS = 731;
/** A week older than this is flagged stale (EIA publishes every Monday; holidays slip a day). */
const STALE_DAYS = 13;

export interface Change { dollars: number; percent: number; from: string }

export interface FuelView {
  fuel: Fuel;
  area: FuelArea;
  /** True when the area is a region standing in for the state. */
  regional: boolean;
  latest: { date: string; value: number } | null;
  us: { date: string; value: number } | null;
  vsUs: { dollars: number; percent: number } | null;
  changes: { week: Change | null; month: Change | null; year: Change | null };
  usChanges: { week: Change | null; month: Change | null; year: Change | null };
  history: Array<{ date: string; value: number | null; us: number | null }>;
  stale: boolean;
}

export interface CostOfLivingResponse {
  state: string | null;
  fuels: FuelView[];
  source: { name: string; url: string; fetchedAt: string | null; attribution: string };
}

export class FuelNotLoadedError extends Error {}

type Point = { date: string; value: number };

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** The observation `weeksBack` weeks before the latest, within 3 days either way. */
function pointBack(points: Point[], weeksBack: number): Point | null {
  if (points.length === 0) return null;
  const target = Date.parse(points[points.length - 1].date) - weeksBack * 7 * DAY;
  let best: Point | null = null;
  for (const point of points) {
    const gap = Math.abs(Date.parse(point.date) - target);
    if (gap <= 3 * DAY && (!best || gap < Math.abs(Date.parse(best.date) - target))) best = point;
  }
  return best;
}

export function changeOver(points: Point[], weeksBack: number): Change | null {
  const latest = points.at(-1);
  const from = pointBack(points, weeksBack);
  if (!latest || !from || from.value <= 0) return null;
  return { dollars: round(latest.value - from.value, 3), percent: round(((latest.value - from.value) / from.value) * 100, 1), from: from.date };
}

const changes = (points: Point[]) => ({ week: changeOver(points, 1), month: changeOver(points, 4), year: changeOver(points, 52) });

export function fuelView(fuel: Fuel, area: FuelArea, points: Point[], usPoints: Point[], now: Date): FuelView {
  const latest = points.at(-1) ?? null;
  const us = usPoints.at(-1) ?? null;
  const cutoff = now.getTime() - HISTORY_DAYS * DAY;
  const usByDate = new Map(usPoints.map((point) => [point.date, point.value]));
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const dates = [...new Set([...points, ...usPoints].map((point) => point.date))].filter((date) => Date.parse(date) >= cutoff).sort();
  return {
    fuel,
    area,
    regional: area.kind === 'region',
    latest,
    us,
    // Compared only when both are the same week.
    vsUs: latest && us && latest.date === us.date ? { dollars: round(latest.value - us.value, 3), percent: round(((latest.value - us.value) / us.value) * 100, 1) } : null,
    changes: changes(points),
    usChanges: changes(usPoints),
    history: dates.map((date) => ({ date, value: byDate.get(date) ?? null, us: usByDate.get(date) ?? null })),
    stale: !latest || now.getTime() - Date.parse(latest.date) > STALE_DAYS * DAY,
  };
}

/** The tab for one state, or the U.S. alone when `state` is null. */
export async function costOfLiving(db: PrismaClient, state: string | null, now = new Date()): Promise<CostOfLivingResponse> {
  const fuels: Fuel[] = ['gasoline', 'diesel'];
  const wanted = fuels.map((fuel) => ({ fuel, area: state ? areaForState(fuel, state) : AREAS.NUS }));
  if (wanted.some((item) => !item.area)) throw new RangeError(`No fuel prices for ${state}`);
  const keys = [...new Set(wanted.flatMap(({ fuel, area }) => [seriesKey(fuel, area!.code), seriesKey(fuel, 'NUS')]))];
  const since = new Date(now.getTime() - (HISTORY_DAYS + 7) * DAY);
  const series = await db.indicatorSeries.findMany({
    where: { key: { in: keys } },
    select: { key: true, observations: { where: { observedAt: { gte: since } }, orderBy: { observedAt: 'asc' }, select: { observedAt: true, value: true, fetchedAt: true } } },
  });
  if (series.length === 0) throw new FuelNotLoadedError('Fuel prices are not loaded yet');
  const pointsOf = (key: string): Point[] => series.find((row) => row.key === key)?.observations.map((row) => ({ date: row.observedAt.toISOString().slice(0, 10), value: row.value.toNumber() })) ?? [];
  const source = await db.dataSource.findUnique({ where: { key: EIA_SOURCE_KEY } });
  const fetchedAt = series.flatMap((row) => row.observations.map((obs) => obs.fetchedAt)).sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    state,
    fuels: wanted.map(({ fuel, area }) => fuelView(fuel, area!, pointsOf(seriesKey(fuel, area!.code)), pointsOf(seriesKey(fuel, 'NUS')), now)),
    source: {
      name: 'U.S. Energy Information Administration',
      url: source?.homepageUrl ?? 'https://www.eia.gov/petroleum/gasdiesel/',
      fetchedAt: (source?.lastSuccessfulAt ?? fetchedAt)?.toISOString() ?? null,
      attribution: source?.attributionText ?? 'Fuel prices: U.S. Energy Information Administration.',
    },
  };
}
