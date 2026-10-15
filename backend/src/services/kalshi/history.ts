/**
 * Reads the hourly Kalshi history in market_snapshots: price series for sparklines,
 * and the races whose price moved most over a fixed window ("biggest movers").
 * Hours the live feed was down have no row; they stay gaps and are never filled.
 */
import type { MarketPriceType, Prisma, PrismaClient } from '@prisma/client';
import { HOUSE_SEATS } from '../../utils/house-seats.js';
import { raceKey } from './catalog.js';
import { isStateCode, partyFromTicker, type MarketScope } from './shared.js';

type Db = Pick<PrismaClient, 'marketSnapshot'>;
type Numeric = number | string | Prisma.Decimal;

const HOUR_MS = 3_600_000;

export interface RaceRef {
  race: string;
  scope: MarketScope;
  stateCode: string | null;
  districtCode: string | null;
}

/** `US-HOUSE`, `US-SENATE`, `PA-SEN`, `PA-07`, or `DE-00` for an at-large seat. */
export function parseRaceKey(key: string): RaceRef | null {
  const race = key.trim().toUpperCase();
  if (race === 'US-HOUSE') return { race, scope: 'NATIONAL_HOUSE', stateCode: null, districtCode: null };
  if (race === 'US-SENATE') return { race, scope: 'NATIONAL_SENATE', stateCode: null, districtCode: null };
  const match = /^([A-Z]{2})-(SEN|\d{2})$/.exec(race);
  if (!match || !isStateCode(match[1])) return null;
  const [, stateCode, rest] = match;
  if (rest === 'SEN') return { race, scope: 'STATE_SENATE', stateCode, districtCode: null };
  const seats = HOUSE_SEATS[stateCode];
  const number = parseInt(rest, 10);
  const valid = seats === 1 ? rest === '00' : number >= 1 && number <= seats;
  return valid ? { race, scope: 'HOUSE_DISTRICT', stateCode, districtCode: rest } : null;
}

const toPercent = (price: Numeric) => Math.round(Number(price) * 1000) / 10;

/** Democratic first, then Republican, then everything else by name (same order as the live board). */
function outcomeOrder(a: { party: 'D' | 'R' | null; outcome: string }, b: { party: 'D' | 'R' | null; outcome: string }) {
  const rank = (party: 'D' | 'R' | null) => (party === 'D' ? 0 : party === 'R' ? 1 : 2);
  return rank(a.party) - rank(b.party) || a.outcome.localeCompare(b.outcome);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** `[epoch ms of the captured hour, price in percent to one decimal]`. */
export type HistoryPoint = [number, number];

export interface MarketHistory {
  ticker: string;
  outcome: string;
  party: 'D' | 'R' | null;
  points: HistoryPoint[];
}

export interface RaceHistory {
  race: string;
  markets: MarketHistory[];
}

export interface HistoryRow {
  scope: MarketScope;
  stateCode: string | null;
  districtCode: string | null;
  sourceMarketId: string;
  outcome: string;
  price: Numeric;
  capturedHour: Date;
}

/** One entry per requested race, in request order; a race with no stored rows has no markets. */
export function groupHistory(rows: HistoryRow[], races: RaceRef[]): RaceHistory[] {
  const byRace = new Map<string, Map<string, MarketHistory>>(races.map((ref) => [ref.race, new Map()]));
  for (const row of rows) {
    const markets = byRace.get(raceKey(row.scope, row.stateCode, row.districtCode));
    if (!markets) continue;
    let market = markets.get(row.sourceMarketId);
    if (!market) {
      market = { ticker: row.sourceMarketId, outcome: row.outcome, party: partyFromTicker(row.sourceMarketId), points: [] };
      markets.set(row.sourceMarketId, market);
    }
    market.points.push([row.capturedHour.getTime(), toPercent(row.price)]);
  }
  return races.map(({ race }) => ({
    race,
    markets: [...byRace.get(race)!.values()]
      .map((market) => ({ ...market, points: market.points.sort((a, b) => a[0] - b[0]) }))
      .sort(outcomeOrder),
  }));
}

export async function getMarketHistory(db: Db, races: RaceRef[], days: number, now = new Date()) {
  const from = new Date(now.getTime() - days * 24 * HOUR_MS);
  const rows = await db.marketSnapshot.findMany({
    where: {
      provider: 'KALSHI',
      capturedHour: { gte: from, lte: now },
      OR: races.map(({ scope, stateCode, districtCode }) => ({ scope, stateCode, districtCode })),
    },
    select: { scope: true, stateCode: true, districtCode: true, sourceMarketId: true, outcome: true, price: true, capturedHour: true },
    orderBy: { capturedHour: 'asc' },
  });
  return { from: from.toISOString(), to: now.toISOString(), days, races: groupHistory(rows, races) };
}

// ---------------------------------------------------------------------------
// Biggest movers
// ---------------------------------------------------------------------------

export type MoversWindow = '24h' | '7d';
export const WINDOW_HOURS: Record<MoversWindow, number> = { '24h': 24, '7d': 168 };

/**
 * The ranking rule, stated once. The movers card's "How this is ranked" note repeats it.
 * - "Now" is each market's newest snapshot within LATEST_WITHIN_HOURS of the newest hour stored.
 * - "Then" is its newest snapshot at or before now minus the window, at most
 *   BASELINE_TOLERANCE_HOURS earlier than that.
 * - Both ends must be bid/ask midpoints with a spread of at most MAX_SPREAD_PTS points.
 * - Each race is listed once, by the outcome that gained the most; a race moves only if that
 *   gain is at least MIN_CHANGE_PTS points.
 */
export const MOVERS_RULES = {
  LATEST_WITHIN_HOURS: 3,
  BASELINE_TOLERANCE_HOURS: 6,
  MAX_SPREAD_PTS: 15,
  MIN_CHANGE_PTS: 1,
} as const;

export interface MoverRow extends HistoryRow {
  priceType: MarketPriceType;
  yesBid: Numeric | null;
  yesAsk: Numeric | null;
  sourceUrl: string | null;
}

export interface Mover {
  race: string;
  scope: MarketScope;
  stateCode: string | null;
  district: string | null;
  ticker: string;
  outcome: string;
  party: 'D' | 'R' | null;
  fromPct: number;
  toPct: number;
  changePts: number;
  fromHour: string;
  toHour: string;
  url: string | null;
}

export interface MoversResult {
  window: MoversWindow;
  asOf: string | null;
  movers: Mover[];
  /** Markets priced now but left out, by reason. Never counted as a 0-point move. */
  excluded: { noBaseline: number; thinQuote: number };
}

function firmQuote(row: MoverRow): boolean {
  if (row.priceType !== 'MIDPOINT' || row.yesBid === null || row.yesAsk === null) return false;
  return (Number(row.yesAsk) - Number(row.yesBid)) * 100 <= MOVERS_RULES.MAX_SPREAD_PTS;
}

/** The newest row per market at or before `before` and no earlier than `notBefore`. */
function newestPerMarket(rows: MoverRow[], notBefore: number, before: number): Map<string, MoverRow> {
  const newest = new Map<string, MoverRow>();
  for (const row of rows) {
    const at = row.capturedHour.getTime();
    if (at < notBefore || at > before) continue;
    const current = newest.get(row.sourceMarketId);
    if (!current || at > current.capturedHour.getTime()) newest.set(row.sourceMarketId, row);
  }
  return newest;
}

export function computeMovers(
  latestRows: MoverRow[],
  baselineRows: MoverRow[],
  options: { window: MoversWindow; limit: number; state?: string | null },
): MoversResult {
  const inState = (row: MoverRow) => !options.state || row.stateCode === options.state;
  const latestScoped = latestRows.filter(inState);
  const newestHour = latestScoped.reduce((max, row) => Math.max(max, row.capturedHour.getTime()), -Infinity);
  if (!Number.isFinite(newestHour)) return { window: options.window, asOf: null, movers: [], excluded: { noBaseline: 0, thinQuote: 0 } };

  const target = newestHour - WINDOW_HOURS[options.window] * HOUR_MS;
  const now = newestPerMarket(latestScoped, newestHour - MOVERS_RULES.LATEST_WITHIN_HOURS * HOUR_MS, newestHour);
  const then = newestPerMarket(baselineRows.filter(inState), target - MOVERS_RULES.BASELINE_TOLERANCE_HOURS * HOUR_MS, target);

  const excluded = { noBaseline: 0, thinQuote: 0 };
  const best = new Map<string, Mover>();
  for (const [ticker, latest] of now) {
    const baseline = then.get(ticker);
    if (!baseline) { excluded.noBaseline++; continue; }
    if (!firmQuote(latest) || !firmQuote(baseline)) { excluded.thinQuote++; continue; }
    const fromPct = toPercent(baseline.price);
    const toPct = toPercent(latest.price);
    const race = raceKey(latest.scope, latest.stateCode, latest.districtCode);
    const mover: Mover = {
      race,
      scope: latest.scope,
      stateCode: latest.stateCode,
      district: latest.districtCode,
      ticker,
      outcome: latest.outcome,
      party: partyFromTicker(ticker),
      fromPct,
      toPct,
      // From the rounded prices, so the change always matches the two numbers shown.
      changePts: Math.round((toPct - fromPct) * 10) / 10,
      fromHour: baseline.capturedHour.toISOString(),
      toHour: latest.capturedHour.toISOString(),
      url: latest.sourceUrl,
    };
    const current = best.get(race);
    if (!current || mover.changePts > current.changePts || (mover.changePts === current.changePts && mover.outcome < current.outcome)) {
      best.set(race, mover);
    }
  }

  const movers = [...best.values()]
    .filter((mover) => mover.changePts >= MOVERS_RULES.MIN_CHANGE_PTS)
    .sort((a, b) => b.changePts - a.changePts || a.race.localeCompare(b.race))
    .slice(0, options.limit);
  return { window: options.window, asOf: new Date(newestHour).toISOString(), movers, excluded };
}

const moverSelect = {
  scope: true, stateCode: true, districtCode: true, sourceMarketId: true, outcome: true,
  price: true, priceType: true, yesBid: true, yesAsk: true, sourceUrl: true, capturedHour: true,
} as const;

// The first stored hour never changes once rows exist, so one lookup per process is enough.
let historyStartCache: Date | null = null;

export async function getHistoryStart(db: Db): Promise<Date | null> {
  if (historyStartCache) return historyStartCache;
  const first = await db.marketSnapshot.findFirst({
    where: { provider: 'KALSHI' },
    orderBy: { capturedHour: 'asc' },
    select: { capturedHour: true },
  });
  historyStartCache = first?.capturedHour ?? null;
  return historyStartCache;
}

export async function getMovers(db: Db, options: { window: MoversWindow; limit: number; state?: string | null }) {
  const scope = options.state ? { stateCode: options.state } : {};
  const [newest, historyStart] = await Promise.all([
    db.marketSnapshot.findFirst({
      where: { provider: 'KALSHI', ...scope },
      orderBy: { capturedHour: 'desc' },
      select: { capturedHour: true },
    }),
    getHistoryStart(db),
  ]);
  const meta = { historyStart: historyStart?.toISOString() ?? null };
  if (!newest) return { ...computeMovers([], [], options), ...meta };

  const newestHour = newest.capturedHour.getTime();
  const target = newestHour - WINDOW_HOURS[options.window] * HOUR_MS;
  const [latestRows, baselineRows] = await Promise.all([
    db.marketSnapshot.findMany({
      where: { provider: 'KALSHI', ...scope, capturedHour: { gte: new Date(newestHour - MOVERS_RULES.LATEST_WITHIN_HOURS * HOUR_MS) } },
      select: moverSelect,
    }),
    db.marketSnapshot.findMany({
      where: {
        provider: 'KALSHI',
        ...scope,
        capturedHour: { gte: new Date(target - MOVERS_RULES.BASELINE_TOLERANCE_HOURS * HOUR_MS), lte: new Date(target) },
      },
      select: moverSelect,
    }),
  ]);
  return { ...computeMovers(latestRows, baselineRows, options), ...meta };
}
