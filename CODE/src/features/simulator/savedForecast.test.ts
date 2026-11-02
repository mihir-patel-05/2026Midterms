import { describe, expect, it } from "vitest";
import type { StateOutcome } from "./model";
import type { SeatOutcome } from "./midterms/model";
import {
  applyScenario,
  clearSavedForecast,
  houseForecastLine,
  readSavedForecast,
  scenarioSearch,
  senateForecastLine,
  writeSavedForecast,
} from "./savedForecast";

function memoryStore() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}
const blockedStore = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("scenarioSearch", () => {
  it("keeps only the scenario, so the open state, layer and chamber are never saved", () => {
    const search = new URLSearchParams("state=PA&chamber=house&layer=counties&district=PA-07&p=NCD2.5&h=PA07R&hswing=1.5");
    expect(scenarioSearch("midterms", search)).toBe("h=PA07R&hswing=1.5&p=NCD2.5");
  });

  it("drops codes and values the simulator would not accept, and defaults", () => {
    // Texas has no seat 99; Pennsylvania has no Senate race in 2026; 2024 is the default base; swings stop at 15.
    const search = new URLSearchParams("base=2024&p=PADl,NCRl,FLRk&h=TX99D,TX15D&swing=40");
    expect(scenarioSearch("midterms", search)).toBe("h=TX15D&p=NCRl%2CFLRk&swing=15");
  });

  it("compares equal scenarios as equal whatever the parameter order", () => {
    const a = scenarioSearch("electoral", new URLSearchParams("p=PAD2.5,GAT&swing=1&d=NE2D"));
    const b = scenarioSearch("electoral", new URLSearchParams("d=NE2D&swing=1&p=PAD2.5,GAT"));
    expect(a).toBe(b);
    expect(scenarioSearch("electoral", new URLSearchParams("state=PA"))).toBe("");
  });

  it("keeps the electoral college's Maine and Nebraska districts, which the midterm map doesn't have", () => {
    expect(scenarioSearch("electoral", new URLSearchParams("d=ME2R"))).toBe("d=ME2R");
    expect(scenarioSearch("midterms", new URLSearchParams("d=ME2R"))).toBe("");
  });
});

describe("applyScenario", () => {
  it("replaces the scenario and keeps the view", () => {
    const current = new URLSearchParams("state=NC&chamber=house&p=GAT&swing=3");
    const next = applyScenario("midterms", current, "p=NCRl&h=NC01R");
    expect(next.get("state")).toBe("NC");
    expect(next.get("chamber")).toBe("house");
    expect(next.get("p")).toBe("NCRl");
    expect(next.get("h")).toBe("NC01R");
    expect(next.has("swing")).toBe(false);
  });

  it("ignores keys that aren't part of the scenario", () => {
    expect(applyScenario("midterms", new URLSearchParams(), "state=TX&p=NCRl").toString()).toBe("p=NCRl");
  });
});

describe("saved forecast storage", () => {
  it("saves, reads back, and clears a forecast per simulator", () => {
    const store = memoryStore();
    const saved = writeSavedForecast("midterms", "p=NCRl&state=NC", new Date("2026-11-02T20:14:00Z"), store);
    expect(saved).toEqual({ kind: "midterms", scenario: "p=NCRl", savedAt: "2026-11-02T20:14:00.000Z" });
    expect(readSavedForecast("midterms", store)).toEqual(saved);
    expect(readSavedForecast("electoral", store)).toBeNull();
    clearSavedForecast("midterms", store);
    expect(readSavedForecast("midterms", store)).toBeNull();
  });

  it("normalises on the way in, so a code no longer on the race list can't break the map", () => {
    const store = memoryStore();
    store.setItem("simulator.forecast.midterms.v1", JSON.stringify({ scenario: "p=PADl,NCRl&h=ZZ01D", savedAt: "2026-11-02T20:14:00Z" }));
    expect(readSavedForecast("midterms", store)?.scenario).toBe("p=NCRl");
  });

  it("treats corrupt or unexpected stored values as nothing saved", () => {
    const store = memoryStore();
    for (const value of ["{", "null", "[]", JSON.stringify({ scenario: 5, savedAt: "2026-11-02T20:14:00Z" }), JSON.stringify({ scenario: "p=NCRl", savedAt: "later" })]) {
      store.setItem("simulator.forecast.midterms.v1", value);
      expect(readSavedForecast("midterms", store)).toBeNull();
    }
  });

  it("says it could not save when the browser blocks storage, and never throws", () => {
    expect(writeSavedForecast("electoral", "p=PAD2.5", new Date(), blockedStore)).toBeNull();
    expect(writeSavedForecast("electoral", "p=PAD2.5", new Date(), null)).toBeNull();
    expect(readSavedForecast("electoral", blockedStore)).toBeNull();
    expect(() => clearSavedForecast("electoral", blockedStore)).not.toThrow();
  });
});

describe("forecast lines", () => {
  const state = (overrides: Partial<StateOutcome>): StateOutcome => ({
    code: "NC", ev: 1, margin: 1.2, baseMargin: -3.2, winner: "D", rating: "lean", pickMargin: null, source: "baseline", editedCounties: 0, ...overrides,
  });
  const seat = (overrides: Partial<SeatOutcome>): SeatOutcome => ({
    code: "PA-07", winner: "R", computed: "R", baseWinner: "R", baseMargin: -1.0, margin: -1.0, unopposed: false, source: "baseline", ...overrides,
  });

  it("words a Senate race by where its result comes from", () => {
    expect(senateForecastLine(state({ source: "pick", winner: "R", margin: null, pickMargin: -2.5 }), 2024, false)).toEqual({ winner: "R", result: "R+2.5", from: "your call" });
    expect(senateForecastLine(state({}), 2024, true)).toEqual({ winner: "D", result: "D+1.2", from: "2024 presidential vote with your swings" });
    expect(senateForecastLine(state({}), 2024, false).from).toBe("2024 presidential vote");
    expect(senateForecastLine(state({ source: "counties" }), 2020, false).from).toBe("from your county settings");
  });

  it("words a House seat, and a call sets a winner without a margin", () => {
    expect(houseForecastLine(seat({ source: "pick", winner: "D" }), 2024, 0)).toEqual({ winner: "D", result: "Democrats", from: "your call" });
    expect(houseForecastLine(seat({ winner: "D", margin: 0.5, source: "swing" }), 2024, 1.5)).toEqual({ winner: "D", result: "D+0.5", from: "2024 result flipped by your House swing" });
    expect(houseForecastLine(seat({}), 2024, 0).from).toBe("2024 result");
    expect(houseForecastLine(seat({ winner: "T", source: "tossup", margin: null }), null, 0)).toEqual({ winner: "T", result: "Tossup", from: "not set" });
  });
});
