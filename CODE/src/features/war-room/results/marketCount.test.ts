import { beforeEach, describe, expect, it } from "vitest";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import type { LiveBoard, LiveCandidate, LiveRace } from "./liveResults";
import {
  advanceMarketCount, emptyMarketCount, findBigMoves, findDivergences, marketFavorites, MOVE_WINDOW_MS, recordPrices,
} from "./marketCount";
import { dismissMarketAlert, marketCountSnapshot, observeMarkets, resetMarketCount } from "./marketCountStore";

const T0 = Date.UTC(2026, 10, 4, 1, 0);
const MIN = 60_000;

function market(ticker: string, race: string, party: "D" | "R" | null, price: number | null): KalshiMarket {
  return {
    ticker, eventTicker: `EV-${race}`, eventTitle: race, scope: race.startsWith("US-") ? "NATIONAL_HOUSE" : "HOUSE_DISTRICT", race,
    stateCode: race.slice(0, 2), district: null, outcome: party === "D" ? "Democratic" : party === "R" ? "Republican" : "Other", party,
    url: "", pricePercent: price, priceType: "MIDPOINT", updatedAt: new Date(T0).toISOString(),
  };
}

function prices(list: KalshiMarket[]) {
  const markets = new Map(list.map((item) => [item.ticker, item]));
  const byRace = new Map<string, KalshiMarket[]>();
  for (const item of list) byRace.set(item.race, [...(byRace.get(item.race) ?? []), item]);
  return { markets, byRace };
}

function candidate(name: string, party: string, votes: number, total: number): LiveCandidate {
  return { id: name, candidacyId: name, name, party, partyName: null, votes, pct: total ? (votes / total) * 100 : 0, isIncumbent: false, isWriteIn: false, fecId: null, call: null };
}

function race(code: string, d: number, r: number, extra: Partial<LiveRace> = {}): LiveRace {
  const total = d + r;
  const candidates = [candidate("Dee", "D", d, total), candidate("Arr", "R", r, total)].sort((a, b) => b.votes - a.votes);
  return {
    code, contestId: code, office: code.endsWith("SEN") ? "US_SENATE" : "US_HOUSE", title: code, candidates, totalVotes: total,
    pctCounted: 40, pctKind: "estimate", status: "IN_PROGRESS", updatedAt: "", calls: [], winner: null,
    marginPts: total ? Math.abs(candidates[0].pct - candidates[1].pct) : null, isTestData: false, finalStatus: null, meta: {} as LiveRace["meta"], ...extra,
  };
}

function board(races: LiveRace[], extra: Partial<LiveBoard> = {}): LiveBoard {
  return {
    races: new Map(races.map((item) => [item.code, item])), waiting: 0, source: {} as LiveBoard["source"], attribution: "",
    freshness: "CURRENT" as LiveBoard["freshness"], updatedAt: "", isTestData: false, isMock: false, ...extra,
  };
}

describe("market favorites", () => {
  it("pick the top-priced outcome and skip ties and unpriced races", () => {
    const { byRace } = prices([
      market("PA7-D", "PA-07", "D", 35), market("PA7-R", "PA-07", "R", 66),
      market("AZ1-D", "AZ-01", "D", 50), market("AZ1-R", "AZ-01", "R", 50),
      market("NE2-D", "NE-02", "D", null),
    ]);
    const favorites = marketFavorites(byRace);
    expect(favorites.get("PA-07")).toEqual({ party: "R", price: 66, outcome: "Republican" });
    expect(favorites.has("AZ-01")).toBe(false);
    expect(favorites.has("NE-02")).toBe(false);
  });
});

describe("divergences", () => {
  const { byRace } = prices([market("PA7-D", "PA-07", "D", 30), market("PA7-R", "PA-07", "R", 70), market("MI-D", "MI-SEN", "D", 55), market("MI-R", "MI-SEN", "R", 45)]);

  it("flag a count leader from the other party than a favorite at 60¢ or more", () => {
    const found = findDivergences(board([race("PA-07", 5200, 4800), race("MI-SEN", 100, 900)]), marketFavorites(byRace));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: "PA-07", leaderParty: "D", leaderName: "Dee", favorite: { party: "R", price: 70 }, key: "PA-07:D:R" });
  });

  it("ignore called races, ties, races with no votes, and mock boards", () => {
    const favorites = marketFavorites(byRace);
    const called = race("PA-07", 5200, 4800);
    expect(findDivergences(board([{ ...called, winner: called.candidates[0] }]), favorites)).toEqual([]);
    expect(findDivergences(board([race("PA-07", 500, 500)]), favorites)).toEqual([]);
    expect(findDivergences(board([race("PA-07", 0, 0)]), favorites)).toEqual([]);
    expect(findDivergences(board([race("PA-07", 5200, 4800)], { isMock: true }), favorites)).toEqual([]);
  });
});

describe("price history and big moves", () => {
  it("keeps one sample while a price sits still and the window's start price after an hour", () => {
    let history = recordPrices(new Map(), [market("H-D", "US-HOUSE", "D", 40)], T0);
    history = recordPrices(history, [market("H-D", "US-HOUSE", "D", 40)], T0 + 10 * MIN);
    expect(history.get("H-D")).toEqual([{ at: T0, price: 40 }]);
    history = recordPrices(history, [market("H-D", "US-HOUSE", "D", 62)], T0 + 90 * MIN);
    expect(history.get("H-D")).toEqual([{ at: T0 + 90 * MIN - MOVE_WINDOW_MS, price: 40 }, { at: T0 + 90 * MIN, price: 62 }]);
  });

  it("finds a 20-point swing within the hour, up or down, and nothing smaller", () => {
    const now = T0 + 30 * MIN;
    let history = recordPrices(new Map(), [market("H-D", "US-HOUSE", "D", 40), market("S-R", "US-SENATE", "R", 80), market("X", "PA-07", "D", 50)], T0);
    const after = [market("H-D", "US-HOUSE", "D", 63), market("S-R", "US-SENATE", "R", 55), market("X", "PA-07", "D", 65)];
    history = recordPrices(history, after, now);
    const moves = findBigMoves(history, prices(after).markets, now);
    expect(moves.map((move) => [move.ticker, move.from, move.to])).toEqual([["S-R", 80, 55], ["H-D", 40, 63]]);
  });

  it("keeps one move per race, since its outcomes move together", () => {
    let history = recordPrices(new Map(), [market("H-D", "US-HOUSE", "D", 40), market("H-R", "US-HOUSE", "R", 60)], T0);
    const after = [market("H-D", "US-HOUSE", "D", 65), market("H-R", "US-HOUSE", "R", 36)];
    history = recordPrices(history, after, T0 + MIN);
    expect(findBigMoves(history, prices(after).markets, T0 + MIN).map((move) => move.ticker)).toEqual(["H-D"]);
  });

  it("forgets swings older than the hour", () => {
    let history = recordPrices(new Map(), [market("H-D", "US-HOUSE", "D", 40)], T0);
    history = recordPrices(history, [market("H-D", "US-HOUSE", "D", 70)], T0 + 5 * MIN);
    const later = [market("H-D", "US-HOUSE", "D", 72)];
    history = recordPrices(history, later, T0 + 2 * MOVE_WINDOW_MS);
    expect(findBigMoves(history, prices(later).markets, T0 + 2 * MOVE_WINDOW_MS)).toEqual([]);
  });
});

describe("advancing the tracker", () => {
  const quiet = prices([market("PA7-D", "PA-07", "D", 30), market("PA7-R", "PA-07", "R", 70)]);

  it("treats divergences on the first board as a baseline, then alerts once per new disagreement on watched races", () => {
    let step = advanceMarketCount(emptyMarketCount(), { board: board([race("PA-07", 5200, 4800)]), ...quiet, watched: ["PA-07"], now: T0 });
    expect(step.fresh).toEqual([]);
    expect(step.state.divergences).toHaveLength(1);

    // Same disagreement: no new alert.
    step = advanceMarketCount(step.state, { board: board([race("PA-07", 5300, 4800)]), ...quiet, watched: ["PA-07"], now: T0 + MIN });
    expect(step.fresh).toEqual([]);

    // It ends, then comes back: alerts.
    step = advanceMarketCount(step.state, { board: board([race("PA-07", 4800, 5300)]), ...quiet, watched: ["PA-07"], now: T0 + 2 * MIN });
    expect(step.state.divergences).toEqual([]);
    step = advanceMarketCount(step.state, { board: board([race("PA-07", 5400, 5300)]), ...quiet, watched: ["PA-07"], now: T0 + 3 * MIN });
    expect(step.fresh.map((alert) => alert.kind)).toEqual(["divergence"]);
  });

  it("lists divergences on unwatched races without alerting", () => {
    let step = advanceMarketCount(emptyMarketCount(), { board: board([]), ...quiet, watched: [], now: T0 });
    step = advanceMarketCount(step.state, { board: board([race("PA-07", 5200, 4800)]), ...quiet, watched: [], now: T0 + MIN });
    expect(step.state.divergences).toHaveLength(1);
    expect(step.fresh).toEqual([]);
  });

  it("always alerts on chamber control swings, once an hour per market", () => {
    let step = advanceMarketCount(emptyMarketCount(), { board: null, ...prices([market("H-D", "US-HOUSE", "D", 40)]), watched: [], now: T0 });
    step = advanceMarketCount(step.state, { board: null, ...prices([market("H-D", "US-HOUSE", "D", 61)]), watched: [], now: T0 + 10 * MIN });
    expect(step.fresh.map((alert) => [alert.kind, alert.code])).toEqual([["move", "US-HOUSE"]]);
    step = advanceMarketCount(step.state, { board: null, ...prices([market("H-D", "US-HOUSE", "D", 66)]), watched: [], now: T0 + 20 * MIN });
    expect(step.fresh).toEqual([]);
  });

  it("starts over when results switch from test data to live numbers", () => {
    let step = advanceMarketCount(emptyMarketCount(), { board: board([race("PA-07", 5200, 4800)], { isTestData: true }), ...quiet, watched: ["PA-07"], now: T0 });
    expect(step.state.testData).toBe(true);
    step = advanceMarketCount(step.state, { board: board([race("PA-07", 5200, 4800)]), ...quiet, watched: ["PA-07"], now: T0 + MIN });
    expect(step.state.testData).toBe(false);
    expect(step.fresh).toEqual([]);
  });
});

describe("the market vs count store", () => {
  beforeEach(() => resetMarketCount());

  it("keeps alerts until dismissed and drops them on a switch from test data", () => {
    const watched = ["PA-07"];
    observeMarkets({ board: board([], { isTestData: true }), ...prices([]), watched, now: T0 });
    observeMarkets({ board: board([race("PA-07", 5200, 4800)], { isTestData: true }), ...prices([market("PA7-R", "PA-07", "R", 70)]), watched, now: T0 + MIN });
    expect(marketCountSnapshot().alerts).toHaveLength(1);
    observeMarkets({ board: board([], { isTestData: false }), ...prices([market("PA7-R", "PA-07", "R", 70)]), watched, now: T0 + 2 * MIN });
    expect(marketCountSnapshot().alerts).toEqual([]);

    observeMarkets({ board: board([race("PA-07", 5200, 4800)]), ...prices([market("PA7-R", "PA-07", "R", 70)]), watched, now: T0 + 3 * MIN });
    const [alert] = marketCountSnapshot().alerts;
    expect(alert.kind).toBe("divergence");
    dismissMarketAlert(alert.key);
    expect(marketCountSnapshot().alerts).toEqual([]);
  });
});
