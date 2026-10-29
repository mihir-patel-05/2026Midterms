import { describe, expect, it } from "vitest";
import type { HistoryPoint } from "@/features/election-monitor/marketHistory";
import { changeOver, HOUR_MS, priceRange, signedPoints, traceSegments, tracePolylines } from "./trace";
import { layerPatch, lensSearch, readLens, theaterLayer, theaterOffice } from "./theater";

const at = (hour: number, value: number): HistoryPoint => [hour * HOUR_MS, value];

describe("traceSegments", () => {
  it("breaks the line where stored hours are missing", () => {
    const points = [at(0, 50), at(1, 51), at(2, 52), at(5, 55), at(6, 56)];
    expect(traceSegments(points)).toEqual([[at(0, 50), at(1, 51), at(2, 52)], [at(5, 55), at(6, 56)]]);
  });

  it("keeps a lone hour as its own segment", () => {
    expect(traceSegments([at(0, 50), at(3, 51)])).toEqual([[at(0, 50)], [at(3, 51)]]);
    expect(traceSegments([])).toEqual([]);
  });
});

describe("changeOver", () => {
  it("compares the last hour with the hour nearest a day earlier", () => {
    const points = [at(0, 40), at(1, 41), at(24, 45), at(25, 44.5)];
    expect(changeOver(points, 24)).toBeCloseTo(3.5);
  });

  it("has no answer when the history does not reach back far enough", () => {
    expect(changeOver([at(20, 40), at(25, 45)], 24)).toBe(null);
    expect(changeOver([], 24)).toBe(null);
  });
});

describe("formatting and scales", () => {
  it("signs points with a real minus", () => {
    expect(signedPoints(3.14)).toBe("+3.1");
    expect(signedPoints(-2)).toBe("−2.0");
    expect(signedPoints(0.04)).toBe("0.0");
  });

  it("fits a scale to the data, at least 20 points tall, within 0 to 100", () => {
    expect(priceRange([[at(0, 52), at(1, 58)]])).toEqual([45, 65]);
    expect(priceRange([[at(0, 3), at(1, 4)]])).toEqual([0, 20]);
    expect(priceRange([[at(0, 97)]])).toEqual([80, 100]);
    expect(priceRange([[at(0, 20)], [at(0, 80)]])).toEqual([20, 80]);
    expect(priceRange([])).toEqual([0, 100]);
  });

  it("draws one polyline per segment inside the domain", () => {
    const lines = tracePolylines([at(0, 50), at(1, 60), at(9, 50), at(10, 40)], [0, 10 * HOUR_MS], [40, 60], 100, 20);
    expect(lines).toEqual(["0.0,10.0 10.0,0.0", "90.0,10.0 100.0,20.0"]);
  });
});

describe("theater parameters", () => {
  it("reads the chamber the way the monitor does", () => {
    expect(theaterOffice({ mode: "odds", oddsOffice: "house", layer: "states" })).toBe("house");
    expect(theaterOffice({ mode: "races", oddsOffice: "senate", layer: "districts" })).toBe("house");
    expect(theaterOffice({ mode: "races", oddsOffice: "senate", layer: "states" })).toBe("senate");
    expect(theaterLayer({ mode: "odds", oddsOffice: "house", layer: "states" })).toBe("districts");
    expect(theaterLayer({ mode: "odds", oddsOffice: "house", layer: "counties" })).toBe("counties");
  });

  it("writes the layer and chamber together", () => {
    expect(layerPatch("districts")).toEqual({ layer: "districts", mode: "odds", oddsOffice: "house" });
    expect(layerPatch("states")).toEqual({ layer: "states", mode: "odds", oddsOffice: "senate" });
    expect(layerPatch("counties")).toEqual({ layer: "counties", mode: "odds" });
  });

  it("keeps the lens in its own parameter", () => {
    expect(readLens(new URLSearchParams("lens=flip"))).toBe("flip");
    expect(readLens(new URLSearchParams("lens=other"))).toBe("leader");
    expect(lensSearch(new URLSearchParams("state=NC&lens=flip"), "leader").toString()).toBe("state=NC&mode=odds");
    expect(lensSearch(new URLSearchParams("state=NC"), "holder").toString()).toBe("state=NC&lens=holder&mode=odds");
  });
});
