import { describe, expect, it } from "vitest";
import { exposureBand, fuelLines, fuelRange, ordinal, signedDollars, signedPercent } from "./costOfLiving";

describe("cost of living helpers", () => {
  it("formats changes with a sign and never shows -0", () => {
    expect(signedDollars(0.123)).toBe("+$0.12");
    expect(signedDollars(-0.5)).toBe("−$0.50");
    expect(signedPercent(0)).toBe("±0.0%");
  });

  it("breaks chart lines at missing weeks", () => {
    const history = [{ date: "a", value: 3, us: 3.1 }, { date: "b", value: null, us: 3.2 }, { date: "c", value: 3.2, us: 3.3 }, { date: "d", value: 3.3, us: 3.4 }];
    expect(fuelLines(history, "value", fuelRange(history), 100, 10)).toHaveLength(1);
    expect(fuelLines(history, "us", fuelRange(history), 100, 10)).toHaveLength(1);
    expect(fuelRange(history)).toEqual([3, 3.4]);
  });

  it("bands scores into fifths and ranks in words", () => {
    expect([0, 19.9, 20, 99.9, 100].map(exposureBand)).toEqual([0, 0, 1, 4, 4]);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 51].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "51st"]);
  });
});
