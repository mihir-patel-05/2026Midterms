/**
 * Tariff exposure score by state (chosen Nov 1; PLAN.md §4.8). Exposure, not a measured cost:
 *
 *   score = mean of the state's percentile ranks among the 50 states and DC on
 *     1. goods imports ÷ state GDP                    (Census imports, BEA nominal GDP via FRED)
 *     2. imports from China, Mexico and Canada ÷ all  (Census)
 *     3. manufacturing jobs ÷ all nonfarm jobs        (BLS via FRED)
 *     4. diesel price change over one year            (EIA; a regional price for most states)
 *
 * Equal weights. A percentile places the state among those with the measure, from 0 (lowest) to 100
 * (highest), ties at their midpoint, so a region's shared diesel price gives its states one rank. A state missing a measure is
 * scored on the others (at least 3) and says so; missing is never read as zero. Computed in code
 * on every read from stored inputs, never by AI.
 */
import type { PrismaClient } from '@prisma/client';
import { STATE_REGION, areaForState, seriesKey as fuelKey } from '../fuel/fuel-catalog.js';
import { changeOver } from '../fuel/fuel-read.js';
import { tradeSeriesKey } from './census-trade.js';

export const EXPOSURE_METHOD_VERSION = 'tariff-exposure-v1';
export const MIN_PARTS = 3;

export type PartKey = 'importsToGdp' | 'partnerShare' | 'manufacturingShare' | 'dieselChange';

export const PARTS: ReadonlyArray<{ key: PartKey; label: string; unit: string; source: string }> = [
  { key: 'importsToGdp', label: 'Goods imports ÷ state GDP', unit: '%', source: 'Census imports by state of destination; BEA GDP via FRED' },
  { key: 'partnerShare', label: 'Imports from China, Mexico and Canada', unit: '% of imports', source: 'Census imports by state of destination' },
  { key: 'manufacturingShare', label: 'Manufacturing share of jobs', unit: '% of nonfarm jobs', source: 'BLS via FRED' },
  { key: 'dieselChange', label: 'Diesel price, change over 1 year', unit: '%', source: 'EIA weekly retail prices' },
];

export interface PartValue {
  value: number;
  /** 0 (lowest state) to 100 (highest), ties at their midpoint. */
  percentile: number;
  period: string;
  /** Diesel only: the price is a region's, standing in for the state. */
  regional?: string;
}

export interface StateExposure {
  state: string;
  /** Null when fewer than MIN_PARTS measures exist. */
  score: number | null;
  /** 1 = most exposed, ties share a rank; null with no score. */
  rank: number | null;
  parts: Partial<Record<PartKey, PartValue>>;
  partsUsed: number;
}

export interface ExposureResponse {
  method: { version: string; formula: string; parts: typeof PARTS; notes: string[] };
  states: StateExposure[];
  periods: Partial<Record<PartKey, string>>;
}

/** Each state's place from 0 (lowest) to 100 (highest), ties at their midpoint. */
export function percentiles(values: Map<string, number>): Map<string, number> {
  const all = [...values.values()];
  const result = new Map<string, number>();
  for (const [state, value] of values) {
    const below = all.filter((other) => other < value).length;
    const tied = all.filter((other) => other === value).length;
    result.set(state, Math.round(((below + (tied - 1) / 2) / Math.max(all.length - 1, 1)) * 1000) / 10);
  }
  return result;
}

export interface RawInputs {
  importsToGdp: Map<string, { value: number; period: string }>;
  partnerShare: Map<string, { value: number; period: string }>;
  manufacturingShare: Map<string, { value: number; period: string }>;
  dieselChange: Map<string, { value: number; period: string; regional?: string }>;
}

/** Scores from raw inputs. Pure, so the method is testable without a database. */
export function scoreStates(inputs: RawInputs, states: readonly string[]): StateExposure[] {
  const ranks = Object.fromEntries(PARTS.map(({ key }) => [key, percentiles(new Map([...inputs[key]].map(([state, item]) => [state, item.value])))])) as Record<PartKey, Map<string, number>>;
  const scored = states.map((state): StateExposure => {
    const parts: Partial<Record<PartKey, PartValue>> = {};
    for (const { key } of PARTS) {
      const item: { value: number; period: string; regional?: string } | undefined = inputs[key].get(state);
      const percentile = ranks[key].get(state);
      if (item && percentile !== undefined) parts[key] = { value: Math.round(item.value * 100) / 100, percentile, period: item.period, ...(item.regional ? { regional: item.regional } : {}) };
    }
    const used = Object.values(parts);
    const score = used.length >= MIN_PARTS ? Math.round((used.reduce((sum, part) => sum + part.percentile, 0) / used.length) * 10) / 10 : null;
    return { state, score, rank: null, parts, partsUsed: used.length };
  });
  for (const item of scored) {
    if (item.score === null) continue;
    item.rank = 1 + scored.filter((other) => other.score !== null && other.score > item.score!).length;
  }
  return scored.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.state.localeCompare(b.state));
}

type Obs = { date: string; value: number };

async function seriesPoints(db: PrismaClient, keys: string[], since: Date): Promise<Map<string, Obs[]>> {
  const rows = await db.indicatorSeries.findMany({
    where: { key: { in: keys } },
    select: { key: true, observations: { where: { observedAt: { gte: since } }, orderBy: { observedAt: 'asc' }, select: { observedAt: true, value: true } } },
  });
  return new Map(rows.map((row) => [row.key, row.observations.map((obs) => ({ date: obs.observedAt.toISOString().slice(0, 10), value: obs.value.toNumber() }))]));
}

const monthLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Reads every stored input and scores the 50 states and DC. */
export async function tariffExposure(db: PrismaClient, now = new Date()): Promise<ExposureResponse> {
  const states = Object.keys(STATE_REGION).sort();
  const since = new Date(now.getTime() - 3 * 365 * 24 * 3600 * 1000);
  const keys = states.flatMap((state) => [tradeSeriesKey(state, 'all'), tradeSeriesKey(state, 'cnmxca'), `fred.${state}NQGSP`, `fred.${state}MFG`, `fred.${state}NA`]);
  const dieselAreas = new Map(states.map((state) => [state, areaForState('diesel', state)!]));
  keys.push(...new Set([...dieselAreas.values()].map((area) => fuelKey('diesel', area.code))));
  const points = await seriesPoints(db, keys, since);

  const inputs: RawInputs = { importsToGdp: new Map(), partnerShare: new Map(), manufacturingShare: new Map(), dieselChange: new Map() };
  for (const state of states) {
    const imports = points.get(tradeSeriesKey(state, 'all'))?.at(-1);
    const partners = points.get(tradeSeriesKey(state, 'cnmxca'))?.at(-1);
    if (imports && imports.value > 0) {
      const year = imports.date.slice(0, 4);
      // The year's GDP: the mean of its four quarters at annual rates (millions of dollars).
      const quarters = (points.get(`fred.${state}NQGSP`) ?? []).filter((obs) => obs.date.startsWith(year));
      if (quarters.length === 4) {
        const gdp = quarters.reduce((sum, obs) => sum + obs.value, 0) / 4 * 1e6;
        inputs.importsToGdp.set(state, { value: (imports.value / gdp) * 100, period: year });
      }
      if (partners && partners.date === imports.date) inputs.partnerShare.set(state, { value: (partners.value / imports.value) * 100, period: year });
    }
    // Manufacturing and all jobs for the same, latest common month.
    const mfg = points.get(`fred.${state}MFG`) ?? [];
    const jobs = new Map((points.get(`fred.${state}NA`) ?? []).map((obs) => [obs.date, obs.value]));
    const month = [...mfg].reverse().find((obs) => jobs.get(obs.date));
    if (month) inputs.manufacturingShare.set(state, { value: (month.value / jobs.get(month.date)!) * 100, period: monthLabel(month.date) });
    const area = dieselAreas.get(state)!;
    const diesel = changeOver(points.get(fuelKey('diesel', area.code)) ?? [], 52);
    const latestDiesel = points.get(fuelKey('diesel', area.code))?.at(-1);
    if (diesel && latestDiesel) inputs.dieselChange.set(state, { value: diesel.percent, period: `${diesel.from} to ${latestDiesel.date}`, ...(area.kind === 'region' ? { regional: area.name } : {}) });
  }
  const periodOf = (map: Map<string, { period: string }>) => {
    const counts = new Map<string, number>();
    for (const item of map.values()) counts.set(item.period, (counts.get(item.period) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  return {
    method: {
      version: EXPOSURE_METHOD_VERSION,
      formula: 'Score = the average of the state\'s percentile ranks (0–100) among the 50 states and DC on the four measures, equal weights. Higher means more exposed.',
      parts: PARTS,
      notes: [
        'Exposure, not a measured cost: it says how much a state\'s economy runs through imports, tariffed partners, manufacturing and freight fuel, not what tariffs have cost it.',
        'Imports are counted by the state of destination on the customs entry, which is not always where goods are used.',
        'Diesel prices are regional for every state but California, so states in a region share that rank.',
        'Equal weights are a judgment. Each measure is shown beside the score so readers can weigh them differently.',
        'Job changes have many causes; this does not isolate the effect of tariffs.',
      ],
    },
    states: scoreStates(inputs, states),
    periods: {
      importsToGdp: periodOf(inputs.importsToGdp),
      partnerShare: periodOf(inputs.partnerShare),
      manufacturingShare: periodOf(inputs.manufacturingShare),
      dieselChange: periodOf(inputs.dieselChange),
    },
  };
}
