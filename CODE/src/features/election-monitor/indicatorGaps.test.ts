import { describe, expect, it } from "vitest";
import { segments, withGaps } from "./indicatorGaps";

const month = (iso: string, value: number): [number, number] => [Date.parse(`${iso}T00:00:00Z`), value];

describe("indicator gaps", () => {
  // October 2025 is missing, as in a shutdown.
  const rows = [month("2025-08-01", 4.3), month("2025-09-01", 4.4), month("2025-11-01", 4.6), month("2025-12-01", 4.5)];

  it("splits a series at a missing period", () => {
    expect(segments(rows, "MONTHLY").map((run) => run.length)).toEqual([2, 2]);
    // Quarterly spacing is not a gap for a quarterly series.
    expect(segments(rows, "QUARTERLY")).toHaveLength(1);
  });

  it("puts a null halfway across a missing period, and nowhere else", () => {
    const filled = withGaps(rows, "MONTHLY");
    expect(filled).toHaveLength(5);
    expect(filled[2][1]).toBeNull();
    expect(filled[2][0]).toBeGreaterThan(rows[1][0]);
    expect(filled[2][0]).toBeLessThan(rows[2][0]);
    expect(withGaps(rows.slice(0, 2), "MONTHLY")).toEqual(rows.slice(0, 2));
  });
});
