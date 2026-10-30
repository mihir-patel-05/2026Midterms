import { describe, expect, it } from "vitest";
import { countdown, etClock, etDate, etHourMinute, FIRST_POLLS_CLOSE, zuluClock } from "./countdown";

describe("countdown", () => {
  it("first polls close at 18:00 Eastern on Nov 3, after daylight saving ends", () => {
    expect(etClock(FIRST_POLLS_CLOSE)).toBe("18:00:00");
    expect(etDate(FIRST_POLLS_CLOSE)).toBe("NOV 3");
  });

  it("counts down in days, hours, minutes and seconds", () => {
    const now = FIRST_POLLS_CLOSE - ((5 * 24 + 3) * 3_600 + 12 * 60 + 44) * 1000;
    expect(countdown(now)).toBe("T–05D 03:12:44");
  });

  it("drops partial seconds instead of rounding up", () => {
    expect(countdown(FIRST_POLLS_CLOSE - 1_500)).toBe("T–00D 00:00:01");
  });

  it("counts up once the target has passed", () => {
    expect(countdown(FIRST_POLLS_CLOSE)).toBe("T+00D 00:00:00");
    expect(countdown(FIRST_POLLS_CLOSE + (12 * 60 + 3) * 1000)).toBe("T+00D 00:12:03");
  });
});

describe("clocks", () => {
  // 17:12:04 UTC on Oct 29 is 13:12:04 EDT; on Nov 3 the same UTC time is 12:12:04 EST.
  const october = Date.parse("2026-10-29T17:12:04Z");
  const november = Date.parse("2026-11-03T17:12:04Z");

  it("follows daylight saving in Eastern time", () => {
    expect(etClock(october)).toBe("13:12:04");
    expect(etClock(november)).toBe("12:12:04");
  });

  it("uses a 24-hour clock, with midnight as 00", () => {
    expect(etHourMinute(Date.parse("2026-11-04T05:00:00Z"))).toBe("00:00");
    expect(etHourMinute(Date.parse("2026-11-04T00:30:00Z"))).toBe("19:30");
  });

  it("prints UTC as Zulu", () => {
    expect(zuluClock(october)).toBe("17:12Z");
  });
});
