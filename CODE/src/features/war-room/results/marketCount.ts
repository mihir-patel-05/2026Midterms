import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { raceLabel } from "../raceCodes";
import type { LiveBoard, LiveRace } from "./liveResults";

/**
 * Market vs count: where the vote count and the Kalshi market point different ways. Two signals, both pure:
 *  - a divergence, when the candidate leading the count is not from the party the race's market favors;
 *  - a big move, when a market's price has moved 20 points or more within the last hour.
 * Price history is what this browser has seen since the War Room opened; nothing is stored or fetched.
 */

/** A market must price its favorite at least this high before a count lead against it counts as a divergence. */
export const FAVORITE_MIN = 60;
/** Points a price must move within MOVE_WINDOW_MS to count as a big move. */
export const MOVE_POINTS = 20;
export const MOVE_WINDOW_MS = 60 * 60 * 1000;

export interface MarketFavorite {
  party: string;
  price: number;
  outcome: string;
}

export interface Divergence {
  /** Race code: `PA-07`, `GA-SEN`. */
  code: string;
  /** Changes when either side changes, so a new disagreement is a new divergence. */
  key: string;
  leaderName: string;
  leaderParty: string;
  leaderPct: number;
  pctCounted: number | null;
  marginPts: number | null;
  favorite: MarketFavorite;
  isTestData: boolean;
}

export interface PriceSample {
  at: number;
  price: number;
}

export interface BigMove {
  /** Race code, or `US-HOUSE` / `US-SENATE` for chamber control. */
  code: string;
  ticker: string;
  outcome: string;
  party: string | null;
  from: number;
  to: number;
  /** When the price was at `from` (epoch ms). */
  fromAt: number;
  at: number;
}

/** The outcome each race's market prices highest, by race code. Ties and unpriced races are left out. */
export function marketFavorites(byRace: Map<string, KalshiMarket[]>): Map<string, MarketFavorite> {
  const favorites = new Map<string, MarketFavorite>();
  for (const [code, markets] of byRace) {
    const priced = markets.filter((market): market is KalshiMarket & { pricePercent: number } => market.pricePercent !== null)
      .sort((a, b) => b.pricePercent - a.pricePercent);
    const [first, second] = priced;
    if (!first || first.party === null || (second && second.pricePercent === first.pricePercent)) continue;
    favorites.set(code, { party: first.party, price: first.pricePercent, outcome: first.outcome });
  }
  return favorites;
}

/** The count's leader when there is a real lead to compare: votes in, nobody called, D or R ahead. */
function countLeader(race: LiveRace) {
  if (race.winner || race.totalVotes <= 0) return null;
  const [first, second] = race.candidates;
  if (!first || first.votes <= 0 || (second && second.votes === first.votes)) return null;
  if (first.party !== "D" && first.party !== "R") return null;
  return first;
}

/** Every uncalled race whose count leader is from a different party than its market favorite, closest count first. */
export function findDivergences(board: LiveBoard, favorites: Map<string, MarketFavorite>): Divergence[] {
  if (board.isMock) return [];
  const out: Divergence[] = [];
  for (const race of board.races.values()) {
    const leader = countLeader(race);
    const favorite = favorites.get(race.code);
    if (!leader || !favorite || favorite.price < FAVORITE_MIN) continue;
    if (favorite.party !== "D" && favorite.party !== "R") continue;
    if (favorite.party === leader.party) continue;
    out.push({
      code: race.code,
      key: `${race.code}:${leader.party}:${favorite.party}`,
      leaderName: leader.name,
      leaderParty: leader.party!,
      leaderPct: leader.pct,
      pctCounted: race.pctCounted,
      marginPts: race.marginPts,
      favorite,
      isTestData: race.isTestData || board.isTestData,
    });
  }
  return out.sort((a, b) => (a.marginPts ?? 0) - (b.marginPts ?? 0) || a.code.localeCompare(b.code));
}

/**
 * Adds each market's current price to its history and drops samples older than the window. A sample is added only
 * when the price changed, so a quiet market keeps one sample. Returns a new map; the old one is left alone.
 */
export function recordPrices(history: ReadonlyMap<string, PriceSample[]>, markets: Iterable<KalshiMarket>, now: number) {
  const next = new Map<string, PriceSample[]>();
  const cutoff = now - MOVE_WINDOW_MS;
  for (const market of markets) {
    const previous = history.get(market.ticker) ?? [];
    const kept = previous.filter((sample) => sample.at >= cutoff);
    // The price at the start of the window is the last one seen before it, so a move that starts from a price that
    // sat still for an hour still counts from there.
    const before = previous.filter((sample) => sample.at < cutoff).pop();
    const samples = before ? [{ at: cutoff, price: before.price }, ...kept.filter((sample) => sample.at > cutoff)] : kept;
    const last = samples[samples.length - 1];
    if (market.pricePercent !== null && (!last || last.price !== market.pricePercent)) samples.push({ at: now, price: market.pricePercent });
    if (samples.length) next.set(market.ticker, samples);
  }
  return next;
}

/** Markets whose price now is MOVE_POINTS or more from its low or high within the window, one per race. The bigger swing wins. */
export function findBigMoves(history: ReadonlyMap<string, PriceSample[]>, markets: ReadonlyMap<string, KalshiMarket>, now: number, points = MOVE_POINTS): BigMove[] {
  const out: BigMove[] = [];
  for (const [ticker, samples] of history) {
    const market = markets.get(ticker);
    if (!market || market.pricePercent === null || samples.length < 2) continue;
    const current = market.pricePercent;
    const inWindow = samples.filter((sample) => sample.at >= now - MOVE_WINDOW_MS);
    if (inWindow.length === 0) continue;
    const low = inWindow.reduce((min, sample) => (sample.price < min.price ? sample : min));
    const high = inWindow.reduce((max, sample) => (sample.price > max.price ? sample : max));
    const rise = current - low.price;
    const fall = high.price - current;
    const from = rise >= fall ? low : high;
    if (Math.abs(current - from.price) < points) continue;
    out.push({ code: market.race, ticker, outcome: market.outcome, party: market.party, from: from.price, to: current, fromAt: from.at, at: now });
  }
  // A race's outcomes move together (D up is R down), so keep only each race's biggest move.
  const seen = new Set<string>();
  return out.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from) || a.ticker.localeCompare(b.ticker))
    .filter((move) => !seen.has(move.code) && Boolean(seen.add(move.code)));
}

export interface MarketAlert {
  key: string;
  kind: "divergence" | "move";
  code: string;
  seenAt: number;
  divergence?: Divergence;
  move?: BigMove;
}

export interface MarketCountState {
  history: Map<string, PriceSample[]>;
  divergences: Divergence[];
  moves: BigMove[];
  /** Divergence keys already seen, so each disagreement alerts once. */
  seenDivergences: Set<string>;
  /** When each market last raised a move alert, so one swing alerts once an hour. */
  lastMoveAlert: Map<string, number>;
  /** Whether the results were test data last time, so a switch to live numbers starts over. */
  testData: boolean | null;
  /** True once the first board has been folded in; divergences already on it never alert. */
  baselined: boolean;
}

export const emptyMarketCount = (): MarketCountState => ({
  history: new Map(),
  divergences: [],
  moves: [],
  seenDivergences: new Set(),
  lastMoveAlert: new Map(),
  testData: null,
  baselined: false,
});

export const isControl = (code: string) => code === "US-HOUSE" || code === "US-SENATE";

/** "House control", "Senate control", or the race label. */
export const marketLabel = (code: string) => (code === "US-HOUSE" ? "House control" : code === "US-SENATE" ? "Senate control" : raceLabel(code));

/** Chamber control markets always alert; race markets only for races in `watched`. */
const alertsFor = (code: string, watched: readonly string[]) => isControl(code) || watched.includes(code);

/**
 * One step: records prices, finds divergences and big moves, and returns the alerts that are new since last time.
 * Divergences already on the first board this tab sees are a baseline and never alert.
 */
export function advanceMarketCount(
  state: MarketCountState,
  input: { board: LiveBoard | null; markets: ReadonlyMap<string, KalshiMarket>; byRace: Map<string, KalshiMarket[]>; watched: readonly string[]; now: number },
): { state: MarketCountState; fresh: MarketAlert[] } {
  const { board, markets, byRace, watched, now } = input;
  const restart = board !== null && state.testData !== null && state.testData !== board.isTestData;
  const base = restart ? { ...emptyMarketCount(), history: state.history } : state;
  const history = recordPrices(base.history, markets.values(), now);
  const divergences = board ? findDivergences(board, marketFavorites(byRace)) : [];
  const moves = findBigMoves(history, markets, now);

  const fresh: MarketAlert[] = [];
  const seenDivergences = new Set(base.seenDivergences);
  for (const divergence of divergences) {
    if (seenDivergences.has(divergence.key)) continue;
    seenDivergences.add(divergence.key);
    if (base.baselined && alertsFor(divergence.code, watched)) {
      fresh.push({ key: `div:${divergence.key}:${now}`, kind: "divergence", code: divergence.code, seenAt: now, divergence });
    }
  }
  // A disagreement that ends and comes back later alerts again.
  const current = new Set(divergences.map((divergence) => divergence.key));
  for (const key of seenDivergences) if (!current.has(key)) seenDivergences.delete(key);

  const lastMoveAlert = new Map(base.lastMoveAlert);
  for (const move of moves) {
    const last = lastMoveAlert.get(move.ticker);
    if (last !== undefined && now - last < MOVE_WINDOW_MS) continue;
    lastMoveAlert.set(move.ticker, now);
    if (alertsFor(move.code, watched)) fresh.push({ key: `move:${move.ticker}:${now}`, kind: "move", code: move.code, seenAt: now, move });
  }

  return {
    state: {
      history,
      divergences,
      moves,
      seenDivergences,
      lastMoveAlert,
      testData: board ? board.isTestData : base.testData,
      baselined: base.baselined || board !== null,
    },
    fresh,
  };
}
