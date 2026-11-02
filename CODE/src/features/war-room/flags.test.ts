import { describe, expect, it } from "vitest";
import { ALL_ON, parseFlags, WAR_ROOM_FLAG_NAMES } from "./flags";

describe("War Room flags", () => {
  it("are all on until the API says otherwise", () => {
    expect(parseFlags(null)).toEqual(ALL_ON);
    expect(parseFlags({ error: "down" })).toEqual(ALL_ON);
    expect(Object.values(ALL_ON).every(Boolean)).toBe(true);
    expect(Object.keys(ALL_ON)).toEqual([...WAR_ROOM_FLAG_NAMES]);
  });

  it("read the API's booleans and ignore anything else", () => {
    const flags = parseFlags({ flags: { watchlist_alerts: false, runoff_labels: "false", nonsense: false } });
    expect(flags.watchlist_alerts).toBe(false);
    expect(flags.runoff_labels).toBe(true);
    expect("nonsense" in flags).toBe(false);
  });
});
