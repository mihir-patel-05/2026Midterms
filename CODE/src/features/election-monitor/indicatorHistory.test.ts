import { describe, expect, it } from "vitest";
import { axisDate, historyRows, inRange, periodText } from "./indicatorHistory";

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("indicator history", () => {
  it("keeps the points inside the chosen range", () => {
    const points: Array<[number, number]> = [[at("2021-11-01"), 1], [at("2021-09-01"), 0], [at("2024-11-01"), 2], [at("2025-10-15"), 3], [at("2026-09-01"), 4]];
    const asOf = Date.parse("2026-10-15T14:00:00Z");
    expect(inRange(points, asOf, "1Y").map(([, v]) => v)).toEqual([4]);
    expect(inRange(points, asOf, "2Y").map(([, v]) => v)).toEqual([2, 3, 4]);
    expect(inRange(points, asOf, "5Y").map(([, v]) => v)).toEqual([1, 2, 3, 4]);
  });

  it("joins the state and U.S. lines on date, breaking each at its own gaps", () => {
    const state: Array<[number, number]> = [[at("2026-06-01"), 5.4], [at("2026-08-01"), 5.5]];
    const us: Array<[number, number]> = [[at("2026-06-01"), 4.1], [at("2026-07-01"), 4.2], [at("2026-08-01"), 4.3]];
    const rows = historyRows({ points: state, frequency: "MONTHLY" }, { points: us, frequency: "MONTHLY" });
    expect(rows.map((row) => row.t)).toEqual([...rows.map((row) => row.t)].sort((a, b) => a - b));
    expect(rows[0]).toEqual({ t: at("2026-06-01"), main: 5.4, us: 4.1 });
    // The state's missing July: a null for the state between June and August, no state value in July.
    expect(rows.filter((row) => row.main === null)).toHaveLength(1);
    expect(rows.find((row) => row.t === at("2026-07-01"))).toEqual({ t: at("2026-07-01"), us: 4.2 });
    expect(rows.at(-1)).toEqual({ t: at("2026-08-01"), main: 5.5, us: 4.3 });
  });

  it("labels periods the way the strip does", () => {
    expect(periodText(at("2026-09-01"), "MONTHLY")).toBe("Sep 2026");
    expect(periodText(at("2026-04-01"), "QUARTERLY")).toBe("Q2 2026");
    expect(periodText(at("2026-10-10"), "WEEKLY")).toBe("Week ending Oct 10, 2026");
    expect(axisDate(at("2025-01-01"))).toBe("Jan ’25");
  });
});
