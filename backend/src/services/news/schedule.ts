/**
 * How often the news job reads Google News, and how often the top stories agent may run.
 *
 * Fixed instants in UTC. Daylight saving time ends on Nov 1, 2026, so election week is
 * Eastern Standard Time (UTC-5): 6 PM ET on Nov 3 is 23:00 UTC.
 */

/** 6 PM ET on Nov 3: polls start closing. */
export const ELECTION_NIGHT_START = new Date('2026-11-03T23:00:00Z');
/** 2 AM ET on Nov 4. */
export const ELECTION_NIGHT_END = new Date('2026-11-04T07:00:00Z');
/** Midnight ET at the end of Nov 4, while results are still coming in. */
export const RESULTS_DAY_END = new Date('2026-11-05T05:00:00Z');

const MINUTE_MS = 60_000;
/** A run that starts a little early still counts, so a 30-minute cron tick never skips a due run. */
const DUE_SLACK_MINUTES = 5;

export function isElectionNight(now: Date): boolean {
  return now >= ELECTION_NIGHT_START && now < ELECTION_NIGHT_END;
}

/** Minutes between news runs: 30 on election night, 2 hours through Nov 4, then 6 hours. */
export function newsIntervalMinutes(now: Date): number {
  if (isElectionNight(now)) return 30;
  return now < RESULTS_DAY_END ? 120 : 360;
}

/** The least minutes between two top stories agent runs. */
export function pickerIntervalMinutes(now: Date): number {
  return isElectionNight(now) ? 30 : 60;
}

/** Whether a news run is due, given when the last one started. */
export function isNewsRunDue(lastStartedAt: Date | null, now: Date): boolean {
  if (!lastStartedAt) return true;
  return now.getTime() - lastStartedAt.getTime() >= (newsIntervalMinutes(now) - DUE_SLACK_MINUTES) * MINUTE_MS;
}
