/**
 * Clock and countdown text for the War Room, in Eastern time. Daylight saving ends on Nov 1, 2026,
 * so election night runs on EST (UTC−5).
 */

/** The first polls close at 18:00 ET on Nov 3 (most of Indiana and Kentucky). */
export const FIRST_POLLS_CLOSE = Date.parse("2026-11-03T23:00:00Z");

const pad = (value: number) => String(value).padStart(2, "0");

/** "T–05D 03:12:44" until the target, then "T+00D 00:12:03" after it. */
export function countdown(now: number, target: number = FIRST_POLLS_CLOSE) {
  const after = now >= target;
  let left = Math.floor(Math.abs(target - now) / 1000);
  const days = Math.floor(left / 86_400);
  left -= days * 86_400;
  const hours = Math.floor(left / 3_600);
  left -= hours * 3_600;
  const minutes = Math.floor(left / 60);
  const seconds = left - minutes * 60;
  return `T${after ? "+" : "–"}${pad(days)}D ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const etFormat = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });
const etShort = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });
const etDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

/** "13:12:04", Eastern time. */
export const etClock = (ms: number) => etFormat.format(ms);
/** "19:30", Eastern time. */
export const etHourMinute = (ms: number) => etShort.format(ms);
/** "OCT 29", Eastern time. */
export const etDate = (ms: number) => etDay.format(ms).toUpperCase();
/** "18:12Z". */
export const zuluClock = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)}Z`;
