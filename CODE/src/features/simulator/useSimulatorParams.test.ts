import { describe, expect, it } from "vitest";
import { EMPTY_SCENARIO, type Scenario } from "./model";
import { MAX_COUNTY_EDITS, parseScenario, writeScenario } from "./useSimulatorParams";

const roundTrip = (scenario: Scenario) => {
  const search = new URLSearchParams();
  writeScenario(search, scenario);
  return { search, parsed: parseScenario(new URLSearchParams(search.toString())).scenario };
};

describe("scenario links", () => {
  it("leave every default out", () => {
    expect(roundTrip(EMPTY_SCENARIO).search.toString()).toBe("");
  });

  it("round-trip every part of a scenario", () => {
    const scenario: Scenario = {
      base: 2016,
      swing: -1.5,
      stateSwing: { PA: 2, GA: -0.5 },
      counties: { "04013": 1.5, "13121": -30 },
      picks: { AZ: { party: "D", rating: "lean" }, GA: { party: "T" }, TX: { party: "R", rating: "safe" } },
      districts: { "ME-2": "D", "NE-2": "T" },
    };
    const { search, parsed } = roundTrip(scenario);
    expect(parsed).toEqual(scenario);
    expect(search.get("p")).toBe("AZDl,GAT,TXRs");
    expect(search.get("d")).toBe("ME2D,NE2T");
  });

  it("round-trip picks with an exact margin, with the rating that margin earns", () => {
    const scenario: Scenario = { ...EMPTY_SCENARIO, picks: { PA: { party: "D", rating: "lean", margin: 2.5 }, OH: { party: "R", rating: "safe", margin: -12 } } };
    const { search, parsed } = roundTrip(scenario);
    expect(search.get("p")).toBe("PAD2.5,OHR12");
    expect(parsed).toEqual(scenario);
  });

  it("caps a margin pick and drops a margin of 0", () => {
    const { scenario } = parseScenario(new URLSearchParams("p=PAD0,GAR250,AZD3.14"));
    expect(scenario.picks).toEqual({ GA: { party: "R", rating: "safe", margin: -100 }, AZ: { party: "D", rating: "lean", margin: 3.1 } });
  });

  it("writes a blank map as base=blank", () => {
    const { search, parsed } = roundTrip({ ...EMPTY_SCENARIO, base: null });
    expect(search.get("base")).toBe("blank");
    expect(parsed.base).toBeNull();
  });

  it("drops values it does not understand", () => {
    const { scenario } = parseScenario(new URLSearchParams("base=1999&swing=99&ss=ZZ3,PA1&p=XXDl,AZDq,AZRk&d=ME9D,NE1R&c=123:4,04013:abc,06037:-250"));
    expect(scenario).toEqual({
      base: 2024,
      swing: 15,
      stateSwing: { PA: 1 },
      counties: { "06037": -100 },
      picks: { AZ: { party: "R", rating: "likely" } },
      districts: { "NE-1": "R" },
    });
  });

  it("keeps at most MAX_COUNTY_EDITS counties", () => {
    const c = Array.from({ length: MAX_COUNTY_EDITS + 5 }, (_, i) => `${String(10000 + i)}:1`).join(",");
    const { scenario, truncated } = parseScenario(new URLSearchParams({ c }));
    expect(Object.keys(scenario.counties)).toHaveLength(MAX_COUNTY_EDITS);
    expect(truncated).toBe(true);
  });
});
