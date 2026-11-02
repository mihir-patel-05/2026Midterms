/**
 * The national environment from VoteHub: presidential approval and the generic congressional ballot.
 *
 * These polls have no race, so they skip the polls database and the race matcher: the API fetches
 * both poll types from VoteHub, averages them with the same method as race polls
 * (`polls-avg-v1`, see average.ts), and keeps the answer in memory for `NATIONAL_CACHE_MS`.
 * Browsers never call VoteHub. Polls via VoteHub, CC BY 4.0: credit it wherever these are shown.
 *
 * No pollster asks a generic Senate ballot, so there is none here; the generic congressional
 * ballot is the House question, and the simulator derives its swings from it in code.
 */
import { computeAverage, type AverageInputPoll, type PollAverage } from './average.js';
import {
  normalizeParty,
  VOTEHUB_ATTRIBUTION,
  VOTEHUB_HOMEPAGE_URL,
  VOTEHUB_LICENSE_URL,
  type PollPopulationCode,
  type VoteHubClient,
} from './votehub-client.js';

export const NATIONAL_POLL_TYPES = { approval: 'approval', genericBallot: 'generic-ballot' } as const;
/** VoteHub's approval polls cover several subjects (Congress, the Supreme Court); this is the president's. */
export const APPROVAL_SUBJECT = 'Donald Trump';
/** The generic ballot polls for this cycle carry the subject "2026". */
export const GENERIC_BALLOT_CYCLE = '2026';
/** VoteHub adds polls a few times a day; three hours keeps us to a few requests a day. */
export const NATIONAL_CACHE_MS = 3 * 60 * 60 * 1000;
/** How many of the newest polls each series lists under its average. */
const RECENT_POLLS = 8;

export interface NationalPoll {
  id: string;
  pollster: string;
  /** YYYY-MM-DD */
  startDate: string | null;
  endDate: string;
  sampleSize: number | null;
  population: PollPopulationCode;
  /** A party the sponsor works for, as VoteHub marks it ("DEM", "REP"), or null. */
  partisan: string | null;
  url: string | null;
  inAverage: boolean;
  answers: Array<{ choice: string; pct: number }>;
}

interface SeriesBase {
  status: PollAverage['status'];
  windowDays: number;
  pollsterCount: number;
  newestEndDate: string | null;
  /** The newest polls, newest first, whether or not they are in the average. */
  recent: NationalPoll[];
}

export interface ApprovalSeries extends SeriesBase {
  subject: string;
  /** Averages in percent, null unless `status` is "average". */
  approve: number | null;
  disapprove: number | null;
  /** Approve minus disapprove in points. */
  net: number | null;
}

export interface GenericBallotSeries extends SeriesBase {
  dem: number | null;
  rep: number | null;
  /** Democratic minus Republican share in points: positive is a Democratic lead. */
  margin: number | null;
}

export interface NationalEnvironment {
  method: string;
  /** YYYY-MM-DD the averages are measured from. */
  asOf: string;
  /** When VoteHub was last read (ISO). */
  fetchedAt: string;
  approval: ApprovalSeries;
  genericBallot: GenericBallotSeries;
  source: { name: string; attribution: string; licenseUrl: string; homepageUrl: string };
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const date = (value: unknown) => {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value.trim()) : null;
  return match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)) ? match[1] : null;
};
const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const POPULATIONS: Record<string, PollPopulationCode> = { lv: 'LV', rv: 'RV', a: 'A', v: 'V' };

/**
 * One national poll record, or null when it can't be read: no pollster or end date, another
 * subject, or fewer than two answers between 0 and 100. `subject` is matched exactly.
 */
export function parseNationalPoll(raw: unknown, subject: string): Omit<NationalPoll, 'inAverage'> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const pollster = text(record.pollster);
  const endDate = date(record.end_date);
  if (!pollster || !endDate || text(record.subject) !== subject) return null;

  const answers: NationalPoll['answers'] = [];
  for (const item of Array.isArray(record.answers) ? record.answers : []) {
    const answer = (item ?? {}) as Record<string, unknown>;
    const choice = text(answer.choice);
    const pct = number(answer.pct);
    if (!choice || pct === null || pct < 0 || pct > 100 || answers.some((seen) => seen.choice.toLowerCase() === choice.toLowerCase())) continue;
    answers.push({ choice, pct: Math.round(pct * 100) / 100 });
  }
  if (answers.length < 2) return null;

  const startDate = date(record.start_date);
  const sample = number(record.sample_size);
  const url = text(record.url);
  const id = text(record.id) ?? `${pollster}|${endDate}|${String(record.population ?? '')}|${String(record.sample_size ?? '')}`;
  return {
    id,
    pollster,
    startDate: startDate && startDate <= endDate ? startDate : null,
    endDate,
    sampleSize: sample !== null && Number.isInteger(sample) && sample > 0 ? sample : null,
    population: POPULATIONS[String(record.population ?? '').trim().toLowerCase()] ?? 'UNKNOWN',
    partisan: text(record.partisan) ? normalizeParty(record.partisan) : null,
    url: url && /^https?:\/\//i.test(url) ? url : null,
    answers,
  };
}

/** "Approve" / "Disapprove" for approval; "DEM" / "REP" for the generic ballot (VoteHub's "Dem", "Rep"). */
function answerKey(kind: keyof typeof NATIONAL_POLL_TYPES, choice: string): string | null {
  if (kind === 'approval') return /^approve$/i.test(choice) ? 'approve' : /^disapprove$/i.test(choice) ? 'disapprove' : null;
  const party = normalizeParty(choice);
  return party === 'DEM' || party === 'REP' ? party : null;
}

/**
 * The average for one series over parsed polls. Only the two answers that matter are averaged
 * (approve and disapprove, or Democrat and Republican), so "Not sure" never counts. Polls a
 * party's committee sponsored are listed but left out, as campaign internals are for races.
 */
export function averageSeries(kind: keyof typeof NATIONAL_POLL_TYPES, polls: Array<Omit<NationalPoll, 'inAverage'>>, asOf: string) {
  const inputs: AverageInputPoll[] = polls.map((poll) => ({
    id: poll.id,
    pollster: poll.pollster,
    endDate: poll.endDate,
    sampleSize: poll.sampleSize,
    population: poll.population,
    isInternal: poll.partisan !== null,
    answers: poll.answers.flatMap((answer) => {
      const key = answerKey(kind, answer.choice);
      return key ? [{ choice: key, pct: answer.pct, party: null, candidateFecId: null }] : [];
    }),
  })).filter((poll) => poll.answers.length === 2);

  const average = computeAverage(inputs, asOf);
  const used = new Set(average.pollIds);
  const share = (key: string) => (average.status === 'average' ? average.candidates.find((candidate) => candidate.name === key)?.pct ?? null : null);
  const kept = new Set(inputs.map((poll) => poll.id));
  const recent = polls
    .filter((poll) => kept.has(poll.id) && poll.endDate <= asOf)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || a.pollster.localeCompare(b.pollster))
    .slice(0, RECENT_POLLS)
    .map((poll) => ({ ...poll, inAverage: used.has(poll.id) }));
  const base: SeriesBase = {
    status: average.status,
    windowDays: average.windowDays,
    pollsterCount: average.pollsterCount,
    newestEndDate: average.newestEndDate,
    recent,
  };
  return { base, share };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const difference = (a: number | null, b: number | null) => (a === null || b === null ? null : round1(a - b));

export function buildNationalEnvironment(raw: { approval: unknown[]; genericBallot: unknown[] }, now: Date): NationalEnvironment {
  const asOf = now.toISOString().slice(0, 10);
  const parse = (records: unknown[], subject: string) => records.flatMap((record) => parseNationalPoll(record, subject) ?? []);

  const approval = averageSeries('approval', parse(raw.approval, APPROVAL_SUBJECT), asOf);
  const approve = approval.share('approve');
  const disapprove = approval.share('disapprove');
  const ballot = averageSeries('genericBallot', parse(raw.genericBallot, GENERIC_BALLOT_CYCLE), asOf);
  const dem = ballot.share('DEM');
  const rep = ballot.share('REP');

  return {
    method: 'polls-avg-v1',
    asOf,
    fetchedAt: now.toISOString(),
    approval: { ...approval.base, subject: APPROVAL_SUBJECT, approve, disapprove, net: difference(approve, disapprove) },
    genericBallot: { ...ballot.base, dem, rep, margin: difference(dem, rep) },
    source: { name: 'VoteHub', attribution: VOTEHUB_ATTRIBUTION, licenseUrl: VOTEHUB_LICENSE_URL, homepageUrl: VOTEHUB_HOMEPAGE_URL },
  };
}

/**
 * Reads both poll types from VoteHub at most once per `NATIONAL_CACHE_MS`. Concurrent requests
 * share one fetch. If VoteHub fails, the last good answer is served (marked by its `fetchedAt`)
 * and the next request tries again; with no good answer yet, the error is thrown.
 */
export class NationalPollsCache {
  private value: NationalEnvironment | null = null;
  private loadedAt = 0;
  private pending: Promise<NationalEnvironment> | null = null;

  constructor(private readonly client: Pick<VoteHubClient, 'getPolls'>, private readonly now: () => number = Date.now) {}

  async get(): Promise<NationalEnvironment> {
    if (this.value && this.now() - this.loadedAt < NATIONAL_CACHE_MS) return this.value;
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async load(): Promise<NationalEnvironment> {
    try {
      const [approval, genericBallot] = await Promise.all([
        this.client.getPolls(NATIONAL_POLL_TYPES.approval),
        this.client.getPolls(NATIONAL_POLL_TYPES.genericBallot),
      ]);
      this.value = buildNationalEnvironment({ approval, genericBallot }, new Date(this.now()));
      this.loadedAt = this.now();
      return this.value;
    } catch (error) {
      if (this.value) {
        console.warn('National polls refresh failed; serving the last good answer:', error instanceof Error ? error.message : error);
        return this.value;
      }
      throw error;
    }
  }
}
