import { describe, expect, it } from "vitest";
import { isElectionNight, resultsAreLive, shouldOpenNight } from "./electionNight";

const ET = (iso: string) => Date.parse(`${iso}-05:00`);

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

describe("election night windows", () => {
  it("starts when the first polls close, 6 PM ET on Nov 3", () => {
    expect(isElectionNight(ET("2026-11-03T17:59:59"))).toBe(false);
    expect(isElectionNight(ET("2026-11-03T18:00:00"))).toBe(true);
    expect(isElectionNight(ET("2026-11-05T05:59:00"))).toBe(true);
    expect(isElectionNight(ET("2026-11-05T06:00:00"))).toBe(false);
  });

  it("keeps results live until Nov 7", () => {
    expect(resultsAreLive(ET("2026-11-03T12:00:00"))).toBe(false);
    expect(resultsAreLive(ET("2026-11-06T23:59:00"))).toBe(true);
    expect(resultsAreLive(ET("2026-11-07T00:00:00"))).toBe(false);
  });
});

describe("shouldOpenNight", () => {
  const night = ET("2026-11-03T20:00:00");

  it("sends a direct visit on election night to the Night screen once per tab", () => {
    const storage = memoryStorage();
    expect(shouldOpenNight(night, true, storage)).toBe(true);
    expect(shouldOpenNight(night, true, storage)).toBe(false);
  });

  it("leaves in-app navigation and other days alone", () => {
    expect(shouldOpenNight(night, false, memoryStorage())).toBe(false);
    expect(shouldOpenNight(ET("2026-11-03T12:00:00"), true, memoryStorage())).toBe(false);
  });

  it("still redirects when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(shouldOpenNight(night, true, blocked)).toBe(true);
    expect(shouldOpenNight(night, true, null)).toBe(true);
  });
});
