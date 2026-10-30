import { describe, expect, it } from "vitest";
import { stateMapItems } from "@/features/election-dashboard/map";
import { etHourMinute, FIRST_POLLS_CLOSE } from "../countdown";
import { closedCount, closingFor, closingSlots, et, nextClose, POLL_CLOSINGS } from "./pollClosings";

describe("poll closings", () => {
  it("lists every state and DC once", () => {
    const states = POLL_CLOSINGS.map((item) => item.state).sort();
    expect(states).toEqual([...stateMapItems.map((item) => item.code), "DC"].sort());
  });

  it("starts at the countdown's first close, 18:00 ET", () => {
    expect(et(18)).toBe(FIRST_POLLS_CLOSE);
    expect(Math.min(...POLL_CLOSINGS.map((item) => item.close))).toBe(FIRST_POLLS_CLOSE);
  });

  it("runs on Eastern standard time, midnight into Nov 4", () => {
    expect(etHourMinute(et(19, 30))).toBe("19:30");
    expect(new Date(et(24)).toISOString()).toBe("2026-11-04T05:00:00.000Z");
    expect(etHourMinute(et(25))).toBe("01:00");
  });

  it("closes the last polls after most of the state", () => {
    for (const item of POLL_CLOSINGS) if (item.last) expect(item.last).toBeGreaterThan(item.close);
  });

  it("groups the timeline by closing time", () => {
    const slots = closingSlots();
    expect(slots.map((slot) => etHourMinute(slot.close))).toEqual(["18:00", "19:00", "19:30", "20:00", "20:30", "21:00", "22:00", "23:00", "00:00"]);
    expect(slots[2].states.map((item) => item.state)).toEqual(["NC", "OH", "WV"]);
    expect(closingFor("IA")?.close).toBe(et(21));
  });

  it("counts states closed and finds the next close", () => {
    expect(closedCount(et(17))).toBe(0);
    expect(closedCount(et(19))).toBe(8);
    expect(nextClose(et(17))).toBe(et(18));
    // Most of Indiana and Kentucky have closed at 18:00; their Central-time counties close at 19:00.
    expect(nextClose(et(18))).toBe(et(19));
    expect(nextClose(et(24, 30))).toBe(et(25));
    expect(nextClose(et(25))).toBe(null);
  });
});
