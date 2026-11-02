import { describe, expect, it } from "vitest";
import { categoryRows, changedStates, dayLabel, gapLabel, otherMayIncludeUnaffiliated, partySplit, pct, shareCell, type EarlyVoteNational, type Tally } from "./earlyVote";

const tally = (dem: number, rep: number, npa = 0, other = 0, unknown = 0): Tally => ({ total: dem + rep + npa + other + unknown, parties: { dem, rep, npa, other, unknown } });
const view = (t: Tally, asOf: string | null = "2026-11-02") => ({ ...t, asOf, changedAt: null });

function national(rows: Record<string, Tally>): EarlyVoteNational {
  const empty = { label: "", available: true, total: tally(0, 0), states: 0, partyStates: 0, asOfRange: null, undated: 0 };
  return {
    categories: { returned: empty, inperson: empty, requested: empty },
    states: Object.entries(rows).map(([state, t]) => ({ state, categories: { returned: view(t) } })),
    checkedAt: "2026-11-02T15:00:00Z",
    changedAt: null,
    refreshSeconds: 120,
    source: { name: "civicAPI", url: "https://civicapi.org/early-vote", attribution: "Early vote data: civicAPI (civicapi.org)" },
  };
}

describe("partySplit", () => {
  it("gives shares of the ballots with a published party, and the D minus R gap", () => {
    const split = partySplit(tally(50, 30, 15, 5))!;
    expect(split.known).toBe(100);
    expect(split.shares).toEqual({ dem: 50, rep: 30, npa: 15, other: 5 });
    expect(split.gap).toBe(20);
    expect(split.unknown).toBe(0);
  });

  it("leaves ballots with no published party out of the shares, and says how many", () => {
    const split = partySplit(tally(30, 10, 0, 0, 60))!;
    expect(split.shares.dem).toBe(75);
    expect(split.unknown).toBe(60);
  });

  it("is null, never a 0–0 split, when the state publishes no party", () => {
    expect(partySplit(tally(0, 0, 0, 0, 1200))).toBeNull();
    expect(partySplit(tally(0, 0))).toBeNull();
  });
});

describe("labels", () => {
  it("names the gap by party and calls a rounded zero even", () => {
    expect(gapLabel(5.24)).toBe("D +5.2");
    expect(gapLabel(-0.36)).toBe("R +0.4");
    expect(gapLabel(0.04)).toBe("Even");
  });

  it("reads a snapshot date as a calendar day, with no time zone shift", () => {
    expect(dayLabel("2026-11-02")).toBe("Nov 2");
    expect(dayLabel("2026-10-31")).toBe("Oct 31");
    expect(dayLabel(null)).toBe("—");
    expect(dayLabel("soon")).toBe("—");
  });

  it("keeps a decimal only where it matters", () => {
    expect(pct(42.37)).toBe("42%");
    expect(pct(3.26)).toBe("3.3%");
    expect(pct(0)).toBe("0%");
  });
});

describe("categoryRows", () => {
  const data = national({ PA: tally(60, 40), GA: tally(0, 0, 0, 0, 500), FL: tally(40, 30, 10), AZ: tally(10, 10, 5) });

  it("sorts by ballots by default", () => {
    expect(categoryRows(data, "returned", "total").map((row) => row.state)).toEqual(["GA", "PA", "FL", "AZ"]);
  });

  it("sorts by the widest gap either way, with total-only states last rather than read as even", () => {
    expect(categoryRows(data, "returned", "gap").map((row) => row.state)).toEqual(["PA", "FL", "AZ", "GA"]);
  });

  it("sorts by state name when given names, and skips states without the category", () => {
    const names = { PA: "Pennsylvania", GA: "Georgia", FL: "Florida", AZ: "Arizona" };
    expect(categoryRows(data, "returned", "name", names).map((row) => row.name)).toEqual(["Arizona", "Florida", "Georgia", "Pennsylvania"]);
    expect(categoryRows(data, "inperson", "total")).toEqual([]);
  });
});

describe("changedStates", () => {
  it("finds states whose total or party split moved, and ignores new states and the first answer", () => {
    const before = national({ PA: tally(60, 40), GA: tally(0, 0, 0, 0, 500), FL: tally(40, 45) });
    const after = national({ PA: tally(61, 40), GA: tally(0, 0, 0, 0, 500), FL: tally(41, 44), NC: tally(5, 5) });
    expect([...changedStates(before, after, "returned")].sort()).toEqual(["FL", "PA"]);
    expect(changedStates(null, after, "returned").size).toBe(0);
  });
});

describe("labels civicAPI doesn't list", () => {
  it("shows a label with nothing under it as not listed, never 0%, and flags Other that may hold unaffiliated voters", () => {
    // Colorado on Nov 2: no separate unaffiliated count, and a large Other.
    const colorado = tally(31, 24, 0, 44);
    const split = partySplit(colorado)!;
    expect(shareCell(split, colorado, "npa")).toBe("—");
    expect(shareCell(split, colorado, "other")).toBe("44%");
    expect(otherMayIncludeUnaffiliated(colorado)).toBe(true);
    const florida = tally(43, 35, 20, 2);
    expect(otherMayIncludeUnaffiliated(florida)).toBe(false);
    expect(shareCell(partySplit(florida)!, florida, "npa")).toBe("20%");
  });
});
