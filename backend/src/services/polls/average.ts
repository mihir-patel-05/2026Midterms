/**
 * The polling average for one race, computed in code (method `polls-avg-v1`).
 *
 * 1. Polls whose field period ended in the last 30 days. Campaign and party
 *    internals are listed on race pages but left out.
 * 2. One poll per pollster: its newest. On the same end date, likely voters
 *    beat registered voters, then voters, then adults; then the larger sample.
 * 3. Weight = sqrt(sample size, capped at 5,000) × 0.5^(age in days / 14).
 *    A poll without a sample size gets the median of the others (600 if none has one).
 * 4. Each candidate's share is the weighted mean over the polls that list
 *    them. A candidate in fewer than half the polls is left out, and so are
 *    answers such as "Undecided" or "Other".
 *
 * Fewer than two pollsters is never averaged: one firm's numbers are shown as
 * they are. No polls is its own state, never a 0 or a 50/50.
 */
import { isOtherAnswer } from './race-match.js';

export const POLL_AVERAGE_METHOD = 'polls-avg-v1';
export const AVERAGE_RULES = { windowDays: 30, halfLifeDays: 14, maxSample: 5000, defaultSample: 600, minPollsters: 2 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const POPULATION_RANK: Record<string, number> = { LV: 0, RV: 1, V: 2, A: 3, UNKNOWN: 4 };

export interface AverageInputAnswer {
  choice: string;
  pct: number;
  party: string | null;
  candidateFecId: string | null;
}

export interface AverageInputPoll {
  id: string;
  pollster: string;
  /** YYYY-MM-DD */
  endDate: string;
  sampleSize: number | null;
  population: string;
  isInternal: boolean;
  answers: AverageInputAnswer[];
}

export interface AverageCandidate {
  /** The FEC ID when the answer matched a candidate, otherwise "name:" and the answer. */
  key: string;
  name: string;
  party: string | null;
  candidateFecId: string | null;
  pct: number;
  /** How many of the polls used list this candidate. */
  polls: number;
}

export type AverageStatus = 'average' | 'too_few' | 'stale' | 'none';

export interface PollAverage {
  /**
   * average: two or more pollsters in the window.
   * too_few: one pollster in the window (its polls are shown, not averaged).
   * stale: published polls exist, none in the window.
   * none: no published polls ("No public polling").
   */
  status: AverageStatus;
  method: typeof POLL_AVERAGE_METHOD;
  windowDays: number;
  /** YYYY-MM-DD the window and ages are measured from. */
  asOf: string;
  pollIds: string[];
  pollsterCount: number;
  newestEndDate: string | null;
  candidates: AverageCandidate[];
  leaderKey: string | null;
  /** Leader minus runner-up in points; null without two candidates or with a tie at the top. */
  margin: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function answerKey(answer: AverageInputAnswer): string {
  return answer.candidateFecId ?? `name:${answer.choice.trim().toLowerCase()}`;
}

function ageDays(endDate: string, asOf: string): number {
  return Math.max(0, (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${endDate}T00:00:00Z`)) / DAY_MS);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The newest poll from each pollster, preferring likely voters and then the larger sample. */
export function latestPerPollster(polls: AverageInputPoll[]): AverageInputPoll[] {
  const byPollster = new Map<string, AverageInputPoll>();
  for (const poll of polls) {
    const key = poll.pollster.trim().toLowerCase();
    const current = byPollster.get(key);
    const better = !current
      || poll.endDate > current.endDate
      || (poll.endDate === current.endDate && (
        (POPULATION_RANK[poll.population] ?? 9) < (POPULATION_RANK[current.population] ?? 9)
        || ((POPULATION_RANK[poll.population] ?? 9) === (POPULATION_RANK[current.population] ?? 9) && (poll.sampleSize ?? 0) > (current.sampleSize ?? 0))
      ));
    if (better) byPollster.set(key, poll);
  }
  return [...byPollster.values()];
}

export function computeAverage(polls: AverageInputPoll[], asOf: string): PollAverage {
  const base = { method: POLL_AVERAGE_METHOD, windowDays: AVERAGE_RULES.windowDays, asOf } as const;
  const empty = (status: AverageStatus, newestEndDate: string | null): PollAverage => ({
    ...base, status, pollIds: [], pollsterCount: 0, newestEndDate, candidates: [], leaderKey: null, margin: null,
  });
  if (polls.length === 0) return empty('none', null);
  const newestEndDate = polls.reduce((latest, poll) => (poll.endDate > latest ? poll.endDate : latest), polls[0].endDate);

  const windowStart = new Date(Date.parse(`${asOf}T00:00:00Z`) - AVERAGE_RULES.windowDays * DAY_MS).toISOString().slice(0, 10);
  const recent = polls.filter((poll) => !poll.isInternal && poll.endDate >= windowStart && poll.endDate <= asOf);
  if (recent.length === 0) return empty('stale', newestEndDate);

  const used = latestPerPollster(recent);
  const fallbackSample = median(used.flatMap((poll) => (poll.sampleSize ? [poll.sampleSize] : []))) ?? AVERAGE_RULES.defaultSample;
  const weights = new Map(used.map((poll) => [
    poll.id,
    Math.sqrt(Math.min(poll.sampleSize ?? fallbackSample, AVERAGE_RULES.maxSample)) * 0.5 ** (ageDays(poll.endDate, asOf) / AVERAGE_RULES.halfLifeDays),
  ]));

  // Newest poll first, so each candidate's name and party come from the latest poll that lists them.
  const ordered = [...used].sort((a, b) => b.endDate.localeCompare(a.endDate));
  const totals = new Map<string, { name: string; party: string | null; candidateFecId: string | null; sum: number; weight: number; polls: number }>();
  for (const poll of ordered) {
    const weight = weights.get(poll.id)!;
    const counted = new Set<string>();
    for (const answer of poll.answers) {
      if (isOtherAnswer(answer.choice)) continue;
      const key = answerKey(answer);
      // Two answers that name one candidate ("Brown", "Sherrod Brown") count once, as the first.
      if (counted.has(key)) continue;
      counted.add(key);
      const total = totals.get(key) ?? { name: answer.choice, party: answer.party, candidateFecId: answer.candidateFecId, sum: 0, weight: 0, polls: 0 };
      total.sum += answer.pct * weight;
      total.weight += weight;
      total.polls += 1;
      totals.set(key, total);
    }
  }

  const candidates = [...totals.entries()]
    .filter(([, total]) => total.polls * 2 >= used.length)
    .map(([key, total]) => ({ key, name: total.name, party: total.party, candidateFecId: total.candidateFecId, pct: round1(total.sum / total.weight), polls: total.polls }))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  const status: AverageStatus = used.length >= AVERAGE_RULES.minPollsters ? 'average' : 'too_few';
  const [first, second] = candidates;
  const margin = status === 'average' && first && second ? round1(first.pct - second.pct) : null;
  return {
    ...base,
    status,
    pollIds: used.map((poll) => poll.id),
    pollsterCount: used.length,
    newestEndDate,
    candidates: status === 'average' ? candidates : [],
    leaderKey: margin ? first.key : null,
    margin: margin || null,
  };
}
