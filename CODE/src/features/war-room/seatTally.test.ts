import { describe, expect, it } from "vitest";
import { buildOddsView, houseHolders, type SeatHoldersFile } from "@/features/election-monitor/oddsMap";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { HOUSE_DISTRICT_CODES, SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import { cents, houseTally, leadersUnder, senateTally } from "./seatTally";

const market = (race: string, party: KalshiMarket["party"], pricePercent: number | null): KalshiMarket => ({
  ticker: `${race}-${party ?? "I"}`, eventTicker: race, eventTitle: race,
  scope: race.endsWith("-SEN") ? "STATE_SENATE" : "HOUSE_DISTRICT", race, stateCode: race.slice(0, 2),
  district: race.endsWith("-SEN") ? null : race.slice(3), outcome: party ?? "Independent", party, url: "https://kalshi.com",
  pricePercent, priceType: pricePercent === null ? null : "MIDPOINT", updatedAt: "2026-10-29T17:00:00Z",
});
const board = (markets: KalshiMarket[]) => {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const item of markets) byRace.set(item.race, [...(byRace.get(item.race) ?? []), item]);
  return byRace;
};

describe("senateTally", () => {
  it("adds market leaders to the seats not up, and counts unpriced races by holder", () => {
    // D leads NC and GA; R leads TX; NE is led by an independent; every other race has no market.
    const view = buildOddsView(board([
      market("NC-SEN", "D", 62), market("NC-SEN", "R", 39),
      market("GA-SEN", "D", 70), market("GA-SEN", "R", 31),
      market("TX-SEN", "D", 20), market("TX-SEN", "R", 81),
      market("NE-SEN", null, 55), market("NE-SEN", "R", 46),
    ]), "senate", null);
    const result = senateTally(view);
    const unpriced = Object.entries(SENATE_RACES_2026).filter(([code]) => !["NC", "GA", "TX", "NE"].includes(code));
    const heldBy = (party: string) => unpriced.filter(([, race]) => race.holder === party).length;
    expect(result.d).toEqual({ notUp: 34, leading: 2, byHolder: heldBy("D"), total: 34 + 2 + heldBy("D") });
    expect(result.r).toEqual({ notUp: 31, leading: 1, byHolder: heldBy("R"), total: 31 + 1 + heldBy("R") });
    expect(result.other).toBe(1);
    expect(result.d.total + result.r.total + result.other).toBe(100);
  });

  it("does not count a tie at the top for either party's leader", () => {
    const view = buildOddsView(board([market("ME-SEN", "D", 50), market("ME-SEN", "R", 50)]), "senate", null);
    const result = senateTally(view);
    // Collins holds ME, so the tied race counts by holder.
    expect(result.r.leading).toBe(0);
    expect(result.d.leading).toBe(0);
    expect(result.r.byHolder).toBe(Object.values(SENATE_RACES_2026).filter((race) => race.holder === "R").length);
  });
});

describe("houseTally", () => {
  const file: SeatHoldersFile = {
    generatedAt: "2026-10-22", source: "test",
    house: { "PA-07": { party: "R", name: "A", since: "2025-01-03" }, "PA-08": { party: "R", name: "B", since: "2025-01-03" } },
    vacant: { "TX-23": { party: "R", name: "C", until: "2026-04-14" } },
    senate: {},
  };

  it("counts leaders, then holders, and leaves seats with neither unknown", () => {
    const view = buildOddsView(board([market("PA-07", "D", 55), market("PA-07", "R", 46)]), "house", houseHolders(file));
    const result = houseTally(view);
    expect(result.d).toEqual({ notUp: 0, leading: 1, byHolder: 0, total: 1 });
    // PA-08 by holder, and TX-23 (vacant) by its last holder.
    expect(result.r).toEqual({ notUp: 0, leading: 0, byHolder: 2, total: 2 });
    expect(result.unknown).toBe(HOUSE_DISTRICT_CODES.length - 3);
    expect(result.toControl).toBe(218);
  });

  it("leaves every unpriced seat unknown until the holders file loads", () => {
    const result = houseTally(buildOddsView(board([]), "house", null));
    expect(result.unknown).toBe(435);
    expect(result.d.total + result.r.total).toBe(0);
  });
});

describe("leadersUnder", () => {
  it("counts priced leaders under the line only", () => {
    const view = buildOddsView(board([
      market("NC-SEN", "D", 59.5), market("NC-SEN", "R", 41),
      market("GA-SEN", "D", 60), market("GA-SEN", "R", 40),
      market("IA-SEN", "D", null), market("IA-SEN", "R", null),
    ]), "senate", null);
    expect(leadersUnder(view, 60)).toBe(1);
  });
});

describe("cents", () => {
  it("keeps a half cent rather than rounding it away", () => {
    expect(cents(35)).toBe("35¢");
    expect(cents(49.5)).toBe("49.5¢");
    expect(cents(50.04)).toBe("50.0¢");
  });
});
