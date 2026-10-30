import { describe, expect, it } from "vitest";
import { demographicsTable, toCsv, toTsv, type DemographicMetric, type DemographicsData } from "./demographics";

const metric = (key: string, value: number | null, kind: DemographicMetric["kind"] = "share", moe: number | null = null): DemographicMetric => ({
  key, label: key === "population" ? "Total population" : `Label, "${key}"`, topic: "race", table: "B03002", kind, value, moe, lowReliability: false,
});

const data = (mode: DemographicsData["selection"]["mode"], areas: DemographicsData["areas"]): DemographicsData => ({
  selection: { state: "TX", counties: [], districts: [], mode },
  acsYear: 2024,
  congress: 119,
  combined: [metric("population", 2000, "count", 30), metric("race_hispanic", 0.45, "share", 0.02)],
  areas,
  missing: { counties: [], districts: [] },
  noOverlap: { counties: [], districts: [] },
  benchmarks: {
    state: { name: "Texas", metrics: [metric("population", 30_000_000, "count"), metric("race_hispanic", 0.4)] },
    nation: { name: "United States", metrics: [metric("population", 330_000_000, "count"), metric("race_hispanic", 0.19)] },
  },
  source: { name: "ACS", attribution: "ACS", homepageUrl: null, dataset: "ACS 2020–2024 5-year estimates", fetchedAt: null },
});

const area = (geoid: string, label: string, population: number) => ({
  geoType: "CONGRESSIONAL_DISTRICT" as const, geoid, name: label, label, countyFips: null, districtCode: geoid.slice(2),
  metrics: [metric("population", population, "count"), metric("race_hispanic", 0.5)],
});

describe("demographicsTable", () => {
  it("lists each area, the selection, the state, and the U.S. for several areas", () => {
    const table = demographicsTable(data("districts", [area("4807", "TX-07", 1000), area("4809", "TX-09", 1000)]));
    expect(table.columns.map((column) => column.label)).toEqual(["TX-07", "TX-09", "Selection", "Texas", "United States"]);
    expect(table.metrics.map((row) => row.key)).toEqual(["population", "race_hispanic"]);
  });

  it("does not repeat the state as the selection for a statewide view", () => {
    const table = demographicsTable(data("state", [area("48", "Texas", 30_000_000)]));
    expect(table.columns.map((column) => column.label)).toEqual(["Texas", "United States"]);
  });

  it("writes raw values and margins, quoting cells that need it", () => {
    const table = demographicsTable(data("districts", [area("4807", "TX-07", 1000)]));
    const lines = toCsv(table).trim().split("\n");
    expect(lines[0]).toBe("measure,key,topic,unit,TX-07,TX-07 MOE,Texas,Texas MOE,United States,United States MOE");
    expect(lines[1]).toBe("Total population,population,race,count,2000,30,30000000,,330000000,");
    expect(lines[2]).toBe('"Label, ""race_hispanic""",race_hispanic,race,share (0-1),0.45,0.02,0.4,,0.19,');
    expect(toTsv(table).split("\n")[1].split("\t")).toHaveLength(10);
  });
});
