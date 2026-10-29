import { describe, expect, it } from "vitest";
import { buildOddsView, houseHolders, type SeatHoldersFile } from "@/features/election-monitor/oddsMap";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { FLIP_COLORS, flipBin, flipCounts, flipOverlay, HOLDER_COLORS, holderOverlay, houseHolderBins, senateHolderBins } from "./holderOverlay";

const market = (race: string, party: KalshiMarket["party"], pricePercent: number | null): KalshiMarket => ({
  ticker: `${race}-${party ?? "I"}`,
  eventTicker: race,
  eventTitle: race,
  scope: race.endsWith("-SEN") ? "STATE_SENATE" : "HOUSE_DISTRICT",
  race,
  stateCode: race.slice(0, 2),
  district: race.endsWith("-SEN") ? null : race.slice(3),
  outcome: party ?? "Independent",
  party,
  url: "https://kalshi.com",
  pricePercent,
  priceType: pricePercent === null ? null : "MIDPOINT",
  updatedAt: "2026-10-29T17:00:00Z",
});
const board = (...markets: KalshiMarket[]) => {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const item of markets) byRace.set(item.race, [...(byRace.get(item.race) ?? []), item]);
  return byRace;
};
const two = (race: string, dem: number) => [market(race, "D", dem), market(race, "R", 100 - dem)];

const file: SeatHoldersFile = {
  generatedAt: "2026-10-22",
  source: "test",
  house: {
    "PA-07": { party: "R", name: "Ryan Mackenzie", since: "2025-01-03" },
    "DE-00": { party: "D", name: "Sarah McBride", since: "2025-01-03" },
    "NC-01": { party: "D", name: "Don Davis", since: "2025-01-03" },
    "AZ-06": { party: "R", name: "Juan Ciscomani", since: "2025-01-03" },
  },
  vacant: { "TX-23": { party: "R", name: "Tony Gonzales", until: "2026-04-14" } },
  senate: {},
};
const holders = houseHolders(file);

describe("seat holder overlay", () => {
  it("colours each Senate seat on the ballot by holder, dimmer when the incumbent is not running", () => {
    const bins = senateHolderBins();
    expect(bins.get("GA")).toBe("D");
    expect(bins.get("NC")).toBe("R-open");
    expect(bins.get("MI")).toBe("D-open");
    // Specials count as seats on the ballot.
    expect(bins.get("OH")).toBe("R");
    expect(bins.get("PA")).toBe("no_race");
    expect(bins.get("DC")).toBe("no_race");
    expect(bins.size).toBe(51);
  });

  it("colours House seats by holder, with vacancies dimmer in the last holder's colour", () => {
    const bins = houseHolderBins(holders)!;
    expect(bins.get("PA-07")).toBe("R");
    expect(bins.get("TX-23")).toBe("R-open");
    expect(bins.size).toBe(435);
  });

  it("covers at-large seats", () => {
    expect(houseHolderBins(holders)!.get("DE-00")).toBe("D");
  });

  it("marks a seat missing from the holders file as unknown, and waits for the file", () => {
    expect(houseHolderBins(holders)!.get("OH-09")).toBe("unknown");
    expect(houseHolderBins(null)).toBe(null);
    expect(holderOverlay("house", null).bins).toBe(null);
  });

  it("has a colour for every bin and keeps the 2026 redistricting outline", () => {
    const overlay = holderOverlay("senate", null);
    for (const bin of overlay.bins!.values()) expect(HOLDER_COLORS[bin]).toBeDefined();
    expect(overlay.redistricting).toBe(true);
  });
});

describe("flip watch overlay", () => {
  const senate = buildOddsView(board(...two("NC-SEN", 62), ...two("GA-SEN", 70), ...two("TX-SEN", 15), market("IA-SEN", "D", null), market("IA-SEN", "R", null)), "senate", null);

  it("hatches a leader from the other party and flags leaders under 75¢", () => {
    expect(flipBin(senate.races.get("NC")!)).toBe("flip");
    expect(flipBin(senate.races.get("GA")!)).toBe("close");
    expect(flipBin(senate.races.get("TX")!)).toBe("safe");
    const overlay = flipOverlay(senate);
    expect(overlay.hatch).toEqual(new Set(["NC"]));
    expect(overlay.bins!.get("NC")).toBe("flip");
  });

  it("never reads a race with no market or no price as safe", () => {
    expect(flipBin(senate.races.get("IA")!)).toBe("unpriced");
    expect(flipBin(senate.races.get("AK")!)).toBe("unpriced");
    expect(flipBin(senate.races.get("PA")!)).toBe("no_race");
  });

  it("never calls a redistricted seat a flip, but still flags it when close", () => {
    // NC redrew for 2026: a D holder of the old NC-01 and an R leader of the new one are not compared.
    const house = buildOddsView(board(...two("NC-01", 40)), "house", holders);
    expect(house.races.get("NC-01")!.flip).toBe(false);
    expect(flipBin(house.races.get("NC-01")!)).toBe("close");
  });

  it("flips at-large seats like any other", () => {
    const house = buildOddsView(board(...two("DE-00", 20), ...two("AZ-06", 55)), "house", holders);
    expect(flipBin(house.races.get("DE-00")!)).toBe("flip");
    expect(flipBin(house.races.get("AZ-06")!)).toBe("flip");
    expect(flipCounts(house)).toEqual({ flips: 2, close: 0 });
  });

  it("shows outlines only while the view loads, and has a colour for every bin", () => {
    expect(flipOverlay(null).bins).toBe(null);
    for (const bin of flipOverlay(senate).bins!.values()) expect(FLIP_COLORS[bin]).toBeDefined();
    expect(flipCounts(senate)).toEqual({ flips: 1, close: 1 });
  });
});
