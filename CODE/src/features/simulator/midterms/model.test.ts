import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HouseYear, PresidentYear } from "@/features/election-monitor/pastResults";
import { EMPTY_SENATE, houseBins, nextSeatPick, senateBins, senateControl, simulateHouse, simulateSenate, type SenateScenario } from "./model";
import { HOUSE_DISTRICT_CODES, HOUSE_SEATS, SENATE_NOT_UP, SENATE_RACES_2026, SENATE_SEATS } from "./races2026";

function load<T>(name: string): T {
  const file = fileURLToPath(new URL(`../../../../public/data/past-results/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, "utf8"));
}

const president2024 = load<PresidentYear>("president-2024");
const house2024 = load<HouseYear>("house-2024");
const senate = (patch: Partial<SenateScenario>, data: PresidentYear | null = president2024) => simulateSenate({ ...EMPTY_SENATE, ...patch }, data);
const FULTON = "13121";

describe("2026 Senate seats", () => {
  it("has 35 races, 22 Republican-held and 13 Democratic-held, for 100 seats in all", () => {
    const races = Object.values(SENATE_RACES_2026);
    expect(races).toHaveLength(35);
    expect(races.filter((race) => race.holder === "R")).toHaveLength(22);
    expect(SENATE_NOT_UP.D + SENATE_NOT_UP.R + races.length).toBe(SENATE_SEATS);
    // Holdovers plus the seats up give today's 53–47 Senate.
    expect(SENATE_NOT_UP.R + 22).toBe(53);
  });
});

describe("simulateSenate", () => {
  it("calls every race from the 2024 presidential vote with no edits", () => {
    const result = senate({});
    expect(result.races.D + result.races.R + result.races.T).toBe(35);
    expect(result.totals.D + result.totals.R + result.totals.T).toBe(SENATE_SEATS);
    // Trump carried Georgia and Michigan; Harris carried Virginia and Colorado.
    expect(result.states.GA.winner).toBe("R");
    expect(result.states.VA.winner).toBe("D");
    expect(result.states.CA).toBeUndefined();
  });

  it("starts a blank map with every race a tossup", () => {
    const result = senate({ base: null }, null);
    expect(result.races).toEqual({ D: 0, R: 0, T: 35 });
    expect(result.totals).toEqual({ D: 34, R: 31, T: 35 });
  });

  it("moves a race when one of its counties is edited", () => {
    const before = senate({}).states.GA;
    const after = senate({ counties: { [FULTON]: 60 } }).states.GA;
    expect(after.margin!).toBeGreaterThan(before.margin!);
    expect(after).toMatchObject({ source: "counties", editedCounties: 1 });
  });

  it("only simulates counties in race states", () => {
    const result = senate({});
    expect(result.counties.has("06037")).toBe(false); // Los Angeles: no California race
    expect(result.counties.has(FULTON)).toBe(true);
  });

  it("lets a pick replace the counties", () => {
    const result = senate({ picks: { TX: { party: "D", rating: "lean" }, ME: { party: "T" } } });
    expect(result.states.TX).toMatchObject({ winner: "D", source: "pick" });
    expect(result.totals.T).toBe(1);
  });
});

describe("senateControl", () => {
  it("needs 51 seats, or 50 with the vice president's party", () => {
    expect(senateControl({ D: 51, R: 49, T: 0 })).toBe("D");
    expect(senateControl({ D: 50, R: 50, T: 0 })).toBe("R");
    expect(senateControl({ D: 49, R: 50, T: 1 })).toBeNull();
  });
});

describe("senateBins", () => {
  it("marks states with no race", () => {
    const bins = senateBins(senate({}), "states");
    expect(bins.get("CA")).toBe("no_race");
    expect(bins.get("GA")).toMatch(/^R\d$/);
  });
});

describe("simulateHouse", () => {
  it("uses the 119th Congress district codes", () => {
    expect(HOUSE_DISTRICT_CODES).toHaveLength(HOUSE_SEATS);
    expect(Object.keys(house2024.districts).sort()).toEqual([...HOUSE_DISTRICT_CODES].sort());
  });

  it("reproduces the 2024 House with no picks", () => {
    expect(simulateHouse({}, house2024).totals).toEqual({ D: 215, R: 220, T: 0 });
  });

  it("counts picks over the baseline", () => {
    const result = simulateHouse({ "PA-07": "D", "CA-13": "T" }, house2024);
    expect(result.districts["PA-07"]).toMatchObject({ winner: "D", baseWinner: "R", source: "pick" });
    expect(result.totals).toEqual({ D: 215, R: 219, T: 1 });
  });

  it("starts a blank map with every seat a tossup", () => {
    expect(simulateHouse({ "TX-28": "R" }, null).totals).toEqual({ D: 0, R: 1, T: 434 });
  });

  it("colours baseline seats by margin and picks at one shade", () => {
    const bins = houseBins(simulateHouse({ "PA-07": "D" }, house2024));
    expect(bins.get("PA-07")).toBe("D2");
    expect(bins.size).toBe(HOUSE_SEATS);
  });
});

describe("nextSeatPick", () => {
  it("flips a decided seat, then restores it", () => {
    expect(nextSeatPick(undefined, "R")).toBe("D");
    expect(nextSeatPick("D", "R")).toBeNull();
  });

  it("goes D, R, then back on a blank seat", () => {
    expect(nextSeatPick(undefined, null)).toBe("D");
    expect(nextSeatPick("D", null)).toBe("R");
    expect(nextSeatPick("R", null)).toBeNull();
  });
});
