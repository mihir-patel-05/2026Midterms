import { describe, expect, it } from "vitest";
import holders from "../../../../public/data/seat-holders-2026.json";
import { SENATE_RACES_2026 } from "./races2026";

/** Senate seats as congress-legislators lists them, keyed "GA-2" (state and class). */
const senate: Record<string, { party: string; name: string }> = holders.senate;

describe("SENATE_RACES_2026", () => {
  // Regular 2026 races are Class 2 seats; the Ohio and Florida specials fill Class 3 seats.
  it.each(Object.entries(SENATE_RACES_2026))("%s matches the senator holding the seat (npm run build:seat-holders)", (state, race) => {
    const seat = senate[`${state}-${race.special ? 3 : 2}`];
    expect(seat, `no senator listed for ${state}`).toBeDefined();
    expect(seat.party).toBe(race.holder);
    // congress-legislators uses full official names ("Susan M. Collins"); the last name is enough.
    expect(seat.name).toContain(race.incumbent.split(" ").at(-1)!);
  });
});
