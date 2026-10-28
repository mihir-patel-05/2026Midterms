/**
 * Pure helpers for showing polls: dates, samples, margins, and which
 * candidates get a column. No React, so they are unit-tested directly.
 */
import type { AverageCandidate, Poll, PollAnswer, PollAverage, PollPopulation, PollsErrorCode } from "./polls";

/** Matches the backend's OTHER_ANSWER: answers that are not a candidate. */
const OTHER_ANSWER = /^(undecided|other|others|someone else|somebody else|not sure|unsure|don'?t know|do not know|refused|no answer|no opinion|neither|none|wouldn'?t vote|would not vote|will not vote|third[- ]party|another candidate|skipped)\b/i;

export function isOtherChoice(choice: string) {
  return OTHER_ANSWER.test(choice.trim());
}

/** Same key as the backend average: the FEC ID, or the answer's name. */
export function answerKey(answer: Pick<PollAnswer, "choice" | "candidateFecId">) {
  return answer.candidateFecId ?? `name:${answer.choice.trim().toLowerCase()}`;
}

const POPULATIONS: Record<PollPopulation, { short: string; long: string }> = {
  LV: { short: "LV", long: "likely voters" },
  RV: { short: "RV", long: "registered voters" },
  V: { short: "V", long: "voters" },
  A: { short: "A", long: "adults" },
  UNKNOWN: { short: "", long: "population not stated" },
};

export function populationLabel(population: PollPopulation) {
  return POPULATIONS[population] ?? POPULATIONS.UNKNOWN;
}

const sampleFormat = new Intl.NumberFormat("en-US");

/** "1,000 LV", "LV" without a sample size, "1,000" without a population, or "—". */
export function sampleLabel(poll: Pick<Poll, "sampleSize" | "population">) {
  const parts = [poll.sampleSize ? sampleFormat.format(poll.sampleSize) : "", populationLabel(poll.population).short].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

/** "1,000 likely voters", for screen readers and tooltips. */
export function sampleDescription(poll: Pick<Poll, "sampleSize" | "population">) {
  const population = populationLabel(poll.population).long;
  return poll.sampleSize ? `${sampleFormat.format(poll.sampleSize)} ${poll.population === "UNKNOWN" ? "respondents" : population}` : population;
}

const parts = (iso: string) => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return { year: date.getUTCFullYear(), month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), day: date.getUTCDate() };
};

/**
 * "Oct 18–20, 2026", "Sep 28 – Oct 2, 2026", "Dec 30, 2025 – Jan 2, 2026", or the end date alone.
 * With `currentYear`, a period inside that year drops the year: "Oct 18–20".
 */
export function fieldDates(startDate: string | null, endDate: string, currentYear?: number) {
  const end = parts(endDate);
  const year = end.year === currentYear ? "" : `, ${end.year}`;
  if (!startDate || startDate === endDate) return `${end.month} ${end.day}${year}`;
  const start = parts(startDate);
  if (start.year !== end.year) return `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
  if (start.month !== end.month) return `${start.month} ${start.day} – ${end.month} ${end.day}${year}`;
  return `${end.month} ${start.day}–${end.day}${year}`;
}

/** "Oct 25" for a date in `year` (default: this year), otherwise "Oct 25, 2025". */
export function shortDate(iso: string, year = new Date().getUTCFullYear()) {
  const date = parts(iso);
  return date.year === year ? `${date.month} ${date.day}` : `${date.month} ${date.day}, ${date.year}`;
}

export function partyShort(party: string | null) {
  if (!party) return null;
  const code = party.toUpperCase();
  return code.startsWith("DEM") ? "D" : code.startsWith("REP") ? "R" : code.startsWith("IND") ? "I" : code.startsWith("LIB") ? "L" : code.startsWith("GR") ? "G" : null;
}

export interface PollColumn {
  key: string;
  name: string;
  party: string | null;
}

/**
 * The candidates the poll table gives a column: the average's top candidates
 * when there is an average, otherwise those named in the most polls (then the
 * higher share in the newest poll). Never more than `max`.
 */
export function pollColumns(polls: Poll[], average: PollAverage, max = 2): PollColumn[] {
  if (average.status === "average" && average.candidates.length >= 2) {
    return average.candidates.slice(0, max).map(({ key, name, party }) => ({ key, name, party }));
  }
  const tally = new Map<string, PollColumn & { count: number; latestPct: number }>();
  // Polls arrive newest first, so the first answer seen for a key is its newest.
  for (const poll of polls) {
    for (const answer of poll.answers) {
      if (isOtherChoice(answer.choice)) continue;
      const key = answerKey(answer);
      const entry = tally.get(key);
      if (entry) entry.count += 1;
      else tally.set(key, { key, name: answer.choice, party: answer.party, count: 1, latestPct: answer.pct });
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || b.latestPct - a.latestPct || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(({ key, name, party }) => ({ key, name, party }));
}

/** A poll's share for one column's candidate, or null when the poll didn't ask about them. */
export function shareFor(poll: Poll, key: string) {
  return poll.answers.find((answer) => answerKey(answer) === key)?.pct ?? null;
}

export function formatShare(pct: number | null) {
  return pct === null ? "—" : Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

/** "Brown +2", "Brown +2.5", or "Tie"; null without both shares. */
export function marginLabel(columns: PollColumn[], shares: Array<number | null>, nameOf: (column: PollColumn) => string = (column) => column.name) {
  const [a, b] = shares;
  if (columns.length < 2 || a === null || b === null || a === undefined || b === undefined) return null;
  const points = Math.round(Math.abs(a - b) * 10) / 10;
  if (points === 0) return "Tie";
  const leader = a > b ? columns[0] : columns[1];
  return `${nameOf(leader)} +${formatShare(points)}`;
}

/** The average's headline: "Brown +2.0", "Tied", or null when there is no average. */
export function averageHeadline(average: PollAverage, nameOf: (candidate: AverageCandidate) => string = (candidate) => candidate.name) {
  if (average.status !== "average" || average.candidates.length < 2) return null;
  const leader = average.candidates.find((candidate) => candidate.key === average.leaderKey);
  return leader && average.margin ? `${nameOf(leader)} +${average.margin.toFixed(1)}` : "Tied";
}

/** Title and text for a race without an average to show. */
export function emptyCopy(average: PollAverage, totalPolls: number): { title: string; copy: string } {
  switch (average.status) {
    case "none":
      return { title: "No public polling", copy: "No public polls of this race have been published. That is not a tie or a 0." };
    case "stale":
      return {
        title: `No polls in the last ${average.windowDays} days`,
        copy: `The newest poll ended ${average.newestEndDate ? shortDate(average.newestEndDate) : "earlier"}, too long ago to average. ${totalPolls === 1 ? "It is" : "They are"} listed below.`,
      };
    case "too_few":
      return { title: "Too few polls for an average", copy: "Only one pollster has polled this race recently, so its numbers are shown as they are, not averaged." };
    default:
      return { title: "", copy: "" };
  }
}

/** Title and text when the polls API can't answer. */
export function errorCopy(code: PollsErrorCode): { title: string; copy: string } {
  switch (code) {
    case "NOT_CONFIGURED":
    case "DISABLED":
      return { title: "Polls aren't connected yet", copy: "VoteInformed hasn't connected its polls database. Nothing is shown rather than guessing." };
    case "NOT_LOADED":
      return { title: "Polls haven't loaded yet", copy: "The first poll sync hasn't finished. Check back shortly." };
    default:
      return { title: "Polls unavailable", copy: "The polls API could not be reached. Nothing is shown rather than guessing." };
  }
}
