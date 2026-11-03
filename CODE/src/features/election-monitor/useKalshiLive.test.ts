import { describe, expect, it } from "vitest";
import { reconnectDelayMs, shouldReopen } from "./useKalshiLive";

describe("reconnectDelayMs", () => {
  it("backs off from 2 seconds to a 60-second ceiling", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(reconnectDelayMs)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000]);
  });
});

describe("shouldReopen", () => {
  const now = 1_000_000;
  it("reopens a stream that has been offline for 30 seconds with nothing reconnecting it", () => {
    expect(shouldReopen({ status: "offline", notLiveSince: now - 30_000 }, 2, false, now)).toBe(true);
    expect(shouldReopen({ status: "offline", notLiveSince: now - 30_000 }, null, false, now)).toBe(true);
    expect(shouldReopen({ status: "offline", notLiveSince: now - 30_000 }, 0, false, now)).toBe(true);
  });
  it("waits while a reconnect is scheduled, the outage is short, or the stream is open", () => {
    expect(shouldReopen({ status: "offline", notLiveSince: now - 60_000 }, 2, true, now)).toBe(false);
    expect(shouldReopen({ status: "offline", notLiveSince: now - 10_000 }, 2, false, now)).toBe(false);
    expect(shouldReopen({ status: "offline", notLiveSince: now - 60_000 }, 1, false, now)).toBe(false);
  });
  it("leaves live, degraded and disabled feeds alone", () => {
    for (const status of ["live", "degraded", "disabled", "connecting"] as const) {
      expect(shouldReopen({ status, notLiveSince: now - 60_000 }, 2, false, now)).toBe(false);
    }
  });
});
