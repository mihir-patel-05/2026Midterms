import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PresidentYear } from "@/features/election-monitor/pastResults";
import { ELECTORAL_VOTES, TOTAL_ELECTORAL_VOTES } from "./electoralVotes";
import { EMPTY_SCENARIO, formatMargin, marginOf, marginPick, nextPick, parseMarginInput, simBins, simulate, withMargin, type Scenario } from "./model";

function load(year: number): PresidentYear {
  const file = fileURLToPath(new URL(`../../../public/data/past-results/president-${year}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, "utf8"));
}

const y2024 = load(2024);
const run = (patch: Partial<Scenario>, data = y2024) => simulate({ ...EMPTY_SCENARIO, ...patch }, data);
const MARICOPA = "04013";

describe("electoral votes", () => {
  it("add up to 538 across 50 states and DC", () => {
    expect(Object.keys(ELECTORAL_VOTES)).toHaveLength(51);
    expect(Object.values(ELECTORAL_VOTES).reduce((sum, value) => sum + value, 0)).toBe(TOTAL_ELECTORAL_VOTES);
  });
});

describe("withMargin", () => {
  it("keeps turnout and the third-party vote", () => {
    const [d, r, o] = withMargin([400, 500, 100], 10);
    expect(d + r + o).toBeCloseTo(1000);
    expect(o).toBe(100);
    expect(marginOf([d, r, o])).toBeCloseTo(10);
  });

  it("caps the margin at the two-party vote", () => {
    expect(withMargin([400, 500, 100], 120)).toEqual([900, 0, 100]);
  });
});

describe("simulate", () => {
  it("reproduces the 2024 result with no edits", () => {
    const result = run({});
    expect(result.totals).toEqual({ D: 226, R: 312, T: 0 });
    expect(result.states.PA.source).toBe("baseline");
    expect(result.districts["NE-2"]).toMatchObject({ winner: "D", source: "baseline" });
    expect(result.districts["ME-2"]).toMatchObject({ winner: "R", source: "baseline" });
  });

  it("starts a blank map with every vote a tossup", () => {
    const result = run({ base: null });
    expect(result.totals).toEqual({ D: 0, R: 0, T: 538 });
    expect(result.counties.size).toBe(0);
  });

  it("moves a state when one of its counties is edited", () => {
    const before = run({}).states.AZ;
    const after = run({ counties: { [MARICOPA]: 15 } }).states.AZ;
    expect(before.winner).toBe("R");
    expect(after).toMatchObject({ winner: "D", source: "counties", editedCounties: 1 });
    expect(run({ counties: { [MARICOPA]: 15 } }).totals.D).toBe(226 + 11);
  });

  it("applies the national swing to every state", () => {
    const base = run({});
    const swung = run({ swing: 2 });
    for (const code of ["PA", "TX", "CA"]) expect(swung.states[code].margin! - base.states[code].margin!).toBeCloseTo(2, 1);
    // Pennsylvania (R+1.7), Michigan (R+1.4), and Wisconsin (R+0.9) flip at D+2.
    for (const code of ["PA", "MI", "WI"]) expect(swung.states[code].winner).toBe("D");
  });

  it("adds a state's own swing to the national one", () => {
    const result = run({ swing: 1, stateSwing: { GA: 2 } });
    expect(result.states.GA.margin! - run({}).states.GA.margin!).toBeCloseTo(3, 1);
  });

  it("lets a pick override the counties", () => {
    const result = run({ counties: { [MARICOPA]: 15 }, picks: { AZ: { party: "R", rating: "lean" } } });
    expect(result.states.AZ).toMatchObject({ winner: "R", rating: "lean", source: "pick" });
    expect(result.states.AZ.margin).toBeGreaterThan(0);
  });

  it("counts a tossup pick as undecided", () => {
    expect(run({ picks: { CA: { party: "T" } } }).totals).toEqual({ D: 226 - 54, R: 312, T: 54 });
  });

  it("reproduces every state's total with no edits, in every year", () => {
    for (const year of [2000, 2004, 2008, 2012, 2016, 2020, 2024]) {
      const data = load(year);
      const result = run({ base: year }, data);
      for (const [code, state] of Object.entries(result.states)) {
        expect(state.margin, `${year} ${code}`).toBeCloseTo(marginOf(data.states[code].votes)!, 9);
      }
    }
  });

  it("gives Florida 2000 to Bush by the certified canvass, not the county returns", () => {
    const result = run({ base: 2000 }, load(2000));
    expect(result.states.FL.winner).toBe("R");
    expect(formatMargin(result.states.FL.margin)).toBe("R+0.01");
  });

  it("swings Alaska, which has no county rows, from its state total", () => {
    const data = load(2024);
    expect(Object.keys(data.counties).some((fips) => fips.startsWith("02"))).toBe(false);
    expect(run({ swing: 3 }).states.AK.margin! - run({}).states.AK.margin!).toBeCloseTo(3, 5);
    expect(run({ counties: { "02020": 50 } }).states.AK.editedCounties).toBe(0);
  });

  it("splits Maine and Nebraska by district", () => {
    const result = run({ districts: { "ME-2": "D", "NE-1": "D" } });
    expect(result.states.ME.ev).toBe(2);
    expect(result.states.NE.ev).toBe(2);
    expect(result.totals).toEqual({ D: 228, R: 310, T: 0 });
  });

  it("has districts follow their state on a blank map until picked", () => {
    const result = run({ base: null, picks: { NE: { party: "R", rating: "safe" } } });
    expect(result.districts["NE-2"]).toMatchObject({ winner: "R", source: "state" });
    expect(result.totals.R).toBe(5);
  });
});

describe("simBins", () => {
  it("shades Safe deepest, Likely in between, and Lean lightest, computed or picked", () => {
    const result = run({ picks: { TX: { party: "D", rating: "likely" }, GA: { party: "T" }, OH: marginPick(2.5), FL: { party: "D", rating: "lean" } } });
    const bins = simBins(result, "states");
    // California 2024 was D+20: Safe, the deepest step.
    expect(bins.get("CA")).toBe("D0");
    expect(bins.get("TX")).toBe("D2");
    expect(bins.get("OH")).toBe("D4");
    expect(bins.get("FL")).toBe("D4");
    expect(bins.get("GA")).toBe("tossup");
    // Pennsylvania 2024 was R+1.7: Lean, the lightest step.
    expect(bins.get("PA")).toBe("R4");
  });

  it("colours every county with a result", () => {
    expect(simBins(run({}), "counties").size).toBe(run({}).counties.size);
  });
});

describe("margin picks", () => {
  it("read typed margins", () => {
    expect(parseMarginInput("D+2.5")).toBe(2.5);
    expect(parseMarginInput(" r + 4 ")).toBe(-4);
    expect(parseMarginInput("R3.04")).toBe(-3);
    expect(parseMarginInput("-1.25")).toBe(-1.3);
    expect(parseMarginInput("2")).toBe(2);
    for (const text of ["", "D+0", "0", "D+-2", "I+3", "D+101", "abc"]) expect(parseMarginInput(text), text).toBeNull();
  });

  it("decide the state, rate it by its size, and keep their margin", () => {
    expect(marginPick(-7)).toEqual({ party: "R", rating: "likely", margin: -7 });
    expect(marginPick(0)).toEqual({ party: "T" });
    const state = run({ picks: { PA: marginPick(2.5) } }).states.PA;
    expect(state).toMatchObject({ winner: "D", rating: "lean", pickMargin: 2.5, source: "pick" });
    expect(run({}).states.PA.pickMargin).toBeNull();
  });
});

describe("nextPick", () => {
  it("flips a decided state, then makes it a tossup, then restores it", () => {
    const flipped = nextPick(undefined, "R");
    expect(flipped).toEqual({ party: "D", rating: "lean" });
    const tossup = nextPick(flipped!, "R");
    expect(tossup).toEqual({ party: "T" });
    expect(nextPick(tossup!, "R")).toBeNull();
  });

  it("goes D, R, then back on a blank map", () => {
    const d = nextPick(undefined, "T");
    expect(d).toEqual({ party: "D", rating: "safe" });
    const r = nextPick(d!, "T");
    expect(r).toEqual({ party: "R", rating: "safe" });
    expect(nextPick(r!, "T")).toBeNull();
  });

  it("restores a state picked for its own winner", () => {
    expect(nextPick({ party: "D", rating: "safe" }, "D")).toBeNull();
  });
});

describe("formatMargin", () => {
  it("shows one decimal, or two when closer than a tenth", () => {
    expect(formatMargin(4.66)).toBe("D+4.7");
    expect(formatMargin(-0.009)).toBe("R+0.01");
    expect(formatMargin(0)).toBe("Even");
    expect(formatMargin(null)).toBe("–");
  });
});
