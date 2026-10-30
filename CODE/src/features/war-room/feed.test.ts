import { describe, expect, it } from "vitest";
import type { Mover } from "@/features/election-monitor/marketHistory";
import { buildFeed, moverRace } from "./feed";

const mover = (race: string, changePts: number, toHour: string, scope: Mover["scope"] = "STATE_SENATE"): Mover => ({
  race, scope, stateCode: race.slice(0, 2), district: null, ticker: race, outcome: "Roy Cooper", party: "D",
  fromPct: 55, toPct: 55 + changePts, changePts, fromHour: "2026-10-28T17:00:00Z", toHour, url: null,
});
const empty = { counts: null, countsErrorAt: null, movers: [], indicators: null, stories: [], sources: [] };

describe("buildFeed", () => {
  it("is empty until a source has answered", () => {
    expect(buildFeed(empty)).toEqual([]);
  });

  it("lists what each source reported, newest first", () => {
    const items = buildFeed({
      ...empty,
      counts: { updatedAt: Date.parse("2026-10-29T15:30:00Z"), races: 470, states: 50 },
      movers: [mover("NC-SEN", 3.1, "2026-10-29T17:00:00Z")],
    });
    expect(items.map((item) => item.tag)).toEqual(["KALSHI", "SYS"]);
    expect(items[0].text).toBe("NC-SEN · Roy Cooper (D) +3.1 pts in 24h, now 58.1¢.");
    expect(items[1].text).toBe("Race counts refreshed · 470 races across 50 states.");
  });

  it("says when the elections API is down instead of showing zero races", () => {
    const [item] = buildFeed({ ...empty, countsErrorAt: Date.parse("2026-10-29T15:30:00Z") });
    expect(item.text).toMatch(/unreachable/);
  });

  it("names the national control markets", () => {
    expect(moverRace({ race: "US-HOUSE", scope: "NATIONAL_HOUSE" })).toBe("House control");
    expect(moverRace({ race: "DE-00", scope: "HOUSE_DISTRICT" })).toBe("DE-AL");
  });
});
