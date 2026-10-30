import { describe, expect, it } from "vitest";
import { binOf, buildCensusView, describeCensus, quantileBreaks, type CensusMapData } from "./censusMap";

describe("quantileBreaks", () => {
  it("splits values into groups of about equal size", () => {
    const breaks = quantileBreaks(Array.from({ length: 60 }, (_, i) => i), 6);
    expect(breaks).toEqual([10, 20, 30, 40, 50]);
    expect(binOf(0, breaks)).toBe("c0");
    expect(binOf(10, breaks)).toBe("c1");
    expect(binOf(59, breaks)).toBe("c5");
  });

  it("drops repeated and minimum breaks so no colour is empty", () => {
    expect(quantileBreaks([0, 0, 0, 0, 0, 1], 6)).toEqual([1]);
    expect(quantileBreaks([5, 5, 5], 6)).toEqual([]);
    expect(quantileBreaks([1, 1, 1, 2, 2, 3], 3)).toEqual([2]);
  });
});

describe("buildCensusView", () => {
  const data: CensusMapData = {
    level: "state",
    acsYear: 2024,
    congress: null,
    metric: { key: "race_hispanic", label: "Hispanic or Latino", kind: "share" },
    values: { TX: 0.4, CA: 0.39, VT: 0.02, ME: 0.02, PR: null },
    lowReliability: ["VT"],
    nation: 0.19,
    source: { dataset: "ACS 2020–2024 5-year estimates", fetchedAt: null },
  };

  it("bins every area with a value and leaves missing ones uncoloured", () => {
    const view = buildCensusView(data);
    expect(view.bins.has("PR")).toBe(false);
    expect(view.bins.get("VT")).toBe("c0");
    expect(view.bins.get("TX")).not.toBe("c0");
    expect(view.legend[0].label).toBe("2.0%–39.0%");
  });

  it("describes an area against the U.S.", () => {
    const view = buildCensusView(data);
    expect(describeCensus(view, "VT", false)).toEqual(["Hispanic or Latino: 2.0% (low reliability)", "U.S. 19.0% · ACS 2024 5-year"]);
    expect(describeCensus(view, "PR", false)).toEqual(["Hispanic or Latino: no Census figure"]);
    expect(describeCensus(null, "TX", true)).toEqual(["Loading Census figures…"]);
  });
});
