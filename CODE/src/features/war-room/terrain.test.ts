import { describe, expect, it } from "vitest";
import { presidentResult, raceResult, type Race } from "@/features/election-monitor/pastResults";
import { demMargin, marginText } from "./terrain";

const race = (...candidates: Array<[string, "D" | "R" | "O", number]>): Race => ({
  special: false, stage: "GEN", candidates: candidates.map(([name, party, votes]) => ({ name, party, partyDetailed: party, votes })),
});

describe("terrain margins", () => {
  it("reads D minus R, signed toward Democrats", () => {
    expect(demMargin(raceResult(race(["A", "R", 520], ["B", "D", 480])))).toBeCloseTo(-4);
    expect(demMargin(raceResult(race(["B", "D", 550], ["A", "R", 450])))).toBeCloseTo(10);
    expect(marginText(raceResult(race(["A", "R", 520], ["B", "D", 480])))).toBe("R+4.0");
  });

  it("uses all votes cast for president", () => {
    expect(demMargin(presidentResult([480, 500, 20], { D: "Harris", R: "Trump" }))).toBeCloseTo(-2);
  });

  it("does not draw a race between two Republicans as close", () => {
    expect(demMargin(raceResult(race(["A", "R", 510], ["C", "R", 490])))).toBe(null);
  });

  it("says when there is no margin", () => {
    expect(marginText(raceResult(undefined))).toBe("No result on file");
    expect(marginText(raceResult({ ...race(["A", "D", 0]), status: "unopposed" }))).toBe("Unopposed (D)");
    expect(demMargin(raceResult(undefined))).toBe(null);
  });
});
