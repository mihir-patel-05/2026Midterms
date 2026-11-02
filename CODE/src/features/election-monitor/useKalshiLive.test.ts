import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "./useKalshiLive";

describe("reconnectDelayMs", () => {
  it("backs off from 2 seconds to a 60-second ceiling", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });
});
