import { describe, expect, it } from "vitest";
import { buildOddsView } from "@/features/election-monitor/oddsMap";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { addToWatchlist, defaultWatchlist, readWatchlist, toggleWatch, WATCHLIST_MAX } from "./watchlist";

const market = (race: string, party: KalshiMarket["party"], pricePercent: number | null): KalshiMarket => ({
  ticker: `${race}-${party}`, eventTicker: race, eventTitle: race,
  scope: race.endsWith("-SEN") ? "STATE_SENATE" : "HOUSE_DISTRICT", race, stateCode: race.slice(0, 2),
  district: race.endsWith("-SEN") ? null : race.slice(3), outcome: String(party), party, url: "https://kalshi.com",
  pricePercent, priceType: "MIDPOINT", updatedAt: "2026-10-29T17:00:00Z",
});
const house = (...races: Array<[string, number]>) => {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const [race, dem] of races) byRace.set(race, [market(race, "D", dem), market(race, "R", 100 - dem)]);
  return buildOddsView(byRace, "house", null);
};

describe("defaultWatchlist", () => {
  it("starts with the swing states that have a Senate race", () => {
    expect(defaultWatchlist(null, null)).toEqual(["GA-SEN", "MI-SEN", "NC-SEN"]);
  });

  it("adds swing-state House seats whose leader is under 65¢, closest first", () => {
    const view = house(["PA-07", 47], ["AZ-06", 51], ["WI-03", 40], ["PA-01", 30], ["OH-09", 50], ["MI-07", 65]);
    // OH-09 is not a swing state; PA-01's leader is at 70¢ and MI-07's at exactly 65¢.
    expect(defaultWatchlist(null, view)).toEqual(["GA-SEN", "MI-SEN", "NC-SEN", "AZ-06", "PA-07", "WI-03"]);
  });

  it("holds 12 races at most", () => {
    const view = house(...Array.from({ length: 14 }, (_, i): [string, number] => [`PA-${String(i + 1).padStart(2, "0")}`, 50 + i * 0.1]));
    expect(defaultWatchlist(null, view)).toHaveLength(12);
  });
});

describe("readWatchlist", () => {
  it("keeps valid race codes once each", () => {
    expect(readWatchlist(JSON.stringify(["NC-SEN", "PA-07", "NC-SEN", "PA-SEN", 7, "XX-01"]))).toEqual(["NC-SEN", "PA-07"]);
  });

  it("reads nothing stored, or anything unreadable, as no list", () => {
    expect(readWatchlist(null)).toBe(null);
    expect(readWatchlist("{")).toBe(null);
    expect(readWatchlist('{"a":1}')).toBe(null);
  });

  it("keeps an empty list as empty, not as the default", () => {
    expect(readWatchlist("[]")).toEqual([]);
  });
});

describe("addToWatchlist", () => {
  it("adds a race in any spelling", () => {
    expect(addToWatchlist(["NC-SEN"], "pa 8")).toEqual({ list: ["NC-SEN", "PA-08"], code: "PA-08" });
    expect(addToWatchlist([], "Ohio")).toEqual({ list: ["OH-SEN"], code: "OH-SEN" });
  });

  it("says why a race can't be added", () => {
    expect(addToWatchlist(["NC-SEN"], "nc senate")).toEqual({ error: "NC-SEN is already on your watchlist." });
    expect(addToWatchlist([], "Pennsylvania")).toEqual({ error: "No Senate race in PA this year. Add a district, like PA-01." });
    expect(addToWatchlist([], "PA-99")).toEqual({ error: "Pennsylvania has 17 districts." });
    const full = Array.from({ length: WATCHLIST_MAX }, (_, i) => `CA-${String(i + 1).padStart(2, "0")}`);
    expect(addToWatchlist(full, "NC-SEN")).toEqual({ error: `The watchlist holds ${WATCHLIST_MAX} races.` });
  });
});

describe("toggleWatch", () => {
  it("adds or removes one race", () => {
    expect(toggleWatch(["NC-SEN"], "PA-07")).toEqual(["NC-SEN", "PA-07"]);
    expect(toggleWatch(["NC-SEN", "PA-07"], "NC-SEN")).toEqual(["PA-07"]);
  });
});
