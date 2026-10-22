import { describe, expect, it } from "vitest";
import { buildOddsView, describeOddsRace, houseHolders, isFlip, oddsBin, oddsLabels, raceLeader, type SeatHolder, type SeatHoldersFile } from "./oddsMap";
import type { KalshiMarket } from "./useKalshiLive";

const market = (race: string, party: KalshiMarket["party"], pricePercent: number | null, outcome = party === "D" ? "Democratic" : party === "R" ? "Republican" : "Independent"): KalshiMarket => ({
  ticker: `${race}-${outcome}`,
  eventTicker: race,
  eventTitle: race,
  scope: race.endsWith("-SEN") ? "STATE_SENATE" : "HOUSE_DISTRICT",
  race,
  stateCode: race.slice(0, 2),
  district: race.endsWith("-SEN") ? null : race.slice(3),
  outcome,
  party,
  url: "https://kalshi.com",
  pricePercent,
  priceType: pricePercent === null ? null : "MIDPOINT",
  updatedAt: "2026-10-22T20:00:00Z",
});
const board = (...markets: KalshiMarket[]) => {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const item of markets) byRace.set(item.race, [...(byRace.get(item.race) ?? []), item]);
  return byRace;
};

describe("oddsBin", () => {
  it("bins the leader's price at 60, 75, and 90", () => {
    expect(oddsBin([market("GA-SEN", "D", 59.9), market("GA-SEN", "R", 40)])).toBe("D0");
    expect(oddsBin([market("GA-SEN", "D", 60), market("GA-SEN", "R", 40)])).toBe("D1");
    expect(oddsBin([market("GA-SEN", "D", 25), market("GA-SEN", "R", 75)])).toBe("R2");
    expect(oddsBin([market("GA-SEN", "D", 10), market("GA-SEN", "R", 90)])).toBe("R3");
  });

  it("gives an independent leader its own colour", () => {
    expect(oddsBin([market("NE-SEN", null, 55), market("NE-SEN", "R", 45)])).toBe("O0");
  });

  it("never reads a missing price or market as 50/50", () => {
    expect(oddsBin([])).toBe("no_market");
    expect(oddsBin([market("GA-SEN", "D", null), market("GA-SEN", "R", null)])).toBe("no_price");
    expect(oddsBin([market("GA-SEN", "D", 50), market("GA-SEN", "R", 50)])).toBe("even");
    expect(raceLeader([market("GA-SEN", "D", 50), market("GA-SEN", "R", 50)])).toBeNull();
  });

  it("uses the only priced outcome when the other has no price", () => {
    expect(raceLeader([market("GA-SEN", "D", null), market("GA-SEN", "R", 80)])?.party).toBe("R");
  });
});

const held = (party: SeatHolder["party"], name = "Member", extra: Partial<SeatHolder> = {}): SeatHolder => ({ party, name, ...extra });

describe("isFlip", () => {
  const leader = raceLeader([market("NC-SEN", "D", 70), market("NC-SEN", "R", 30)]);
  it("marks a leader from the other party", () => {
    expect(isFlip(leader, held("R"), false)).toBe(true);
    expect(isFlip(leader, held("D"), false)).toBe(false);
    expect(isFlip(leader, null, false)).toBe(false);
  });
  it("compares a vacant seat with its last holder, and an independent with neither party", () => {
    expect(isFlip(leader, held("R", "Gone", { vacant: true }), false)).toBe(true);
    expect(isFlip(leader, held("O"), false)).toBe(true);
  });
  it("never marks a redistricted seat", () => {
    expect(isFlip(leader, held("R"), true)).toBe(false);
  });
});

describe("houseHolders", () => {
  it("reads held and vacant seats, and maps independents to their own side", () => {
    const file: SeatHoldersFile = {
      generatedAt: "2026-10-22",
      source: "test",
      house: { "CA-03": { party: "I", name: "Kevin Kiley", since: "2025-01-03" }, "PA-07": { party: "R", name: "Ryan Mackenzie", since: "2025-01-03" } },
      vacant: { "TX-23": { party: "R", name: "Tony Gonzales", until: "2026-04-14" } },
      senate: {},
    };
    const seats = houseHolders(file);
    expect(seats.get("CA-03")).toEqual({ party: "O", name: "Kevin Kiley" });
    expect(seats.get("TX-23")).toEqual({ party: "R", name: "Tony Gonzales", vacant: true });
    expect(seats.size).toBe(3);
  });
});

describe("buildOddsView", () => {
  it("colours Senate states, and greys states with no race", () => {
    const view = buildOddsView(board(market("NC-SEN", "D", 70), market("NC-SEN", "R", 31), market("GA-SEN", "D", 80)), "senate", null);
    expect(view.bins.get("NC")).toBe("D1");
    expect(view.flips.has("NC")).toBe(true);
    expect(view.flips.has("GA")).toBe(false);
    expect(view.bins.get("CA")).toBe("no_race");
    expect(view.bins.get("DC")).toBe("no_race");
    expect(view.bins.get("TX")).toBe("no_market");
    expect(view.total).toBe(35);
    expect(view.withMarket).toBe(2);
    expect(view.priced).toBe(2);
    expect(view.priceType).toBe("bid/ask midpoint");
  });

  it("keys House races by district, at-large included, and flips against today's holder", () => {
    const view = buildOddsView(
      board(market("DE-00", "D", 97), market("PA-07", "D", 62), market("PA-07", "R", 38), market("TX-28", "R", 70)),
      "house",
      new Map([["PA-07", held("R")], ["DE-00", held("D")], ["TX-28", held("D")]]),
    );
    expect(view.total).toBe(435);
    expect(view.bins.get("DE-00")).toBe("D3");
    expect(view.bins.get("PA-07")).toBe("D1");
    expect(view.flips).toEqual(new Set(["PA-07"]));
    expect(view.races.get("TX-28")?.redistricted).toBe(true);
    expect(view.bins.get("CA-01")).toBe("no_market");
  });
});

describe("describeOddsRace", () => {
  it("lists prices, the holder, the flip, and the redistricting caveat", () => {
    const view = buildOddsView(
      board(market("TX-28", "R", 70), market("TX-28", "D", 30), market("VA-02", "D", 95), market("NE-02", "R", 55), market("NE-02", "D", 45)),
      "house",
      // VA and NE are not redistricted, so their holders are compared.
      new Map([["TX-28", held("D", "Henry Cuellar")], ["VA-02", held("D", "Former Member", { vacant: true })], ["NE-02", held("O", "Independent Member")]]),
    );
    expect(describeOddsRace(view.races.get("TX-28"), "house")).toEqual(["Republican 70%", "Democratic 30%", "Shape shows 2024 lines; the market is for the 2026 district"]);
    expect(describeOddsRace(view.races.get("VA-02"), "house")).toEqual(["Democratic 95%", "Vacant; last held by Former Member (D)"]);
    expect(describeOddsRace(view.races.get("NE-02"), "house")).toEqual(["Republican 55%", "Democratic 45%", "Held by Independent Member (I)", "Leader is from a different party than the holder"]);
    const senate = buildOddsView(board(market("ME-SEN", "D", 64.5), market("ME-SEN", "R", 35.5), market("NC-SEN", "D", 96)), "senate", null);
    expect(describeOddsRace(senate.races.get("ME"), "senate")).toEqual(["Democratic 64.5%", "Republican 35.5%", "Held by Susan Collins (R)", "Leader is from a different party than the holder"]);
    expect(describeOddsRace(senate.races.get("NC"), "senate")).toEqual(["Democratic 96%", "Held by Thom Tillis (R), not running", "Leader is from a different party than the holder"]);
    expect(describeOddsRace(senate.races.get("CA"), "senate")).toEqual(["No Senate race in 2026"]);
  });
});

describe("oddsLabels", () => {
  it("labels the leader's rounded price, with ink that reads on the fill", () => {
    const view = buildOddsView(board(market("MT-SEN", "R", 93.4), market("IA-SEN", "R", 59), market("NE-SEN", null, 55.2), market("NE-SEN", "R", 44.8)), "senate", null);
    const labels = new Map(oddsLabels(view).map((label) => [label.code, label]));
    expect(labels.get("MT")).toMatchObject({ price: "93%", ink: "#ffffff" });
    expect(labels.get("IA")).toMatchObject({ price: "59%", ink: "#0b0f16" });
    expect(labels.get("NE")).toMatchObject({ price: "I 55%", hatch: true });
    expect(labels.get("CA")).toMatchObject({ price: "", ink: "#8b93a1" });
  });
});
