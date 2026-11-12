/**
 * Certification, recounts, deadlines and ranked-choice final rounds, entered by an admin from each state's own
 * pages (#136, docs/plans/lock-2026-record.md). No feed reports these, so every entry carries the link it came
 * from. A state-wide entry is written once per federal race in that state; results themselves are never edited:
 * civicAPI's numbers stay as published, and a state's different certified total is recorded as a CORRECTED
 * event with the state's numbers in its notes.
 */
import type { PrismaClient } from '@prisma/client';
import { CIVICAPI_SOURCE_KEY } from '../../services/ballot/ballot-sync.js';

export const CERTIFICATION_CYCLE = 2026;

/** What an admin can record, and the certification status each sets. */
export const RECORDABLE_EVENTS = {
  CERTIFIED: 'CERTIFIED',
  RECOUNT_STARTED: 'RECOUNT',
  // The recount is over; the race goes back to its count-based status until the state certifies again.
  RECOUNT_COMPLETED: 'CANVASSING',
  CONTESTED: 'CONTESTED',
  // The state's certified totals differ from civicAPI's; the notes hold the state's numbers.
  CORRECTED: 'CERTIFIED',
} as const;
export type RecordableEvent = keyof typeof RECORDABLE_EVENTS;

export class CertificationInputError extends Error {}

const STATE = /^[A-Z]{2}$/;

function httpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CertificationInputError('The source must be a full link to the state’s page (https://…)');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CertificationInputError('The source must be an http(s) link');
  return url.toString();
}

function state(value: string): string {
  const code = value.trim().toUpperCase();
  if (!STATE.test(code)) throw new CertificationInputError('A state is a two-letter code (WV)');
  return code;
}

async function civicSourceId(db: PrismaClient): Promise<string> {
  const source = await db.dataSource.findUnique({ where: { key: CIVICAPI_SOURCE_KEY }, select: { id: true } });
  if (!source) throw new CertificationInputError('No civicAPI source yet; run the ballot sync first');
  return source.id;
}

/** The cycle's federal contests in a state, from the results source. */
async function stateContests(db: PrismaClient, sourceId: string, stateCode: string) {
  return db.contest.findMany({
    where: { sourceId, stateCode, office: { in: ['US_SENATE', 'US_HOUSE'] }, electionEvent: { cycle: CERTIFICATION_CYCLE } },
    select: { id: true, office: true, districtCode: true },
    orderBy: [{ office: 'desc' }, { districtCode: 'asc' }],
  });
}

const label = (contest: { office: string; districtCode: string | null }, stateCode: string) =>
  contest.office === 'US_SENATE' ? `${stateCode}-SEN` : `${stateCode}-${contest.districtCode}`;

export interface StateRow {
  state: string;
  races: number;
  certified: number;
  recount: number;
  deadline: { deadline: string; sourceUrl: string; notes: string | null } | null;
  /** The latest state-wide or race event, newest first, for the admin list. */
  latest: { type: string; effectiveAt: string; sourceUrl: string; race: string } | null;
}

/** Every state with federal races this cycle, with what has been recorded for it. */
export async function certificationOverview(db: PrismaClient): Promise<StateRow[]> {
  const sourceId = await civicSourceId(db);
  const contests = await db.contest.findMany({
    where: { sourceId, office: { in: ['US_SENATE', 'US_HOUSE'] }, electionEvent: { cycle: CERTIFICATION_CYCLE }, stateCode: { not: null } },
    select: {
      stateCode: true, office: true, districtCode: true,
      certificationEvents: { orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }], take: 1, select: { type: true, certification: true, effectiveAt: true, sourceUrl: true } },
    },
  });
  const deadlines = new Map((await db.certificationDeadline.findMany({ where: { cycle: CERTIFICATION_CYCLE } })).map((row) => [row.stateCode, row]));
  const states = new Map<string, StateRow>();
  for (const contest of contests) {
    const code = contest.stateCode!;
    const row = states.get(code) ?? {
      state: code, races: 0, certified: 0, recount: 0, latest: null,
      deadline: deadlines.has(code) ? { deadline: deadlines.get(code)!.deadline.toISOString().slice(0, 10), sourceUrl: deadlines.get(code)!.sourceUrl, notes: deadlines.get(code)!.notes } : null,
    };
    row.races++;
    const event = contest.certificationEvents[0];
    if (event?.certification === 'CERTIFIED') row.certified++;
    if (event?.certification === 'RECOUNT') row.recount++;
    if (event && (!row.latest || event.effectiveAt.toISOString() > row.latest.effectiveAt)) {
      row.latest = { type: event.type, effectiveAt: event.effectiveAt.toISOString(), sourceUrl: event.sourceUrl, race: label(contest, code) };
    }
    states.set(code, row);
  }
  return [...states.values()].sort((a, b) => a.state.localeCompare(b.state));
}

/** Sets (or replaces) a state's certification deadline with its source. */
export async function setDeadline(db: PrismaClient, input: { state: string; deadline: string; sourceUrl: string; notes?: string | null }) {
  const stateCode = state(input.state);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || Number.isNaN(Date.parse(`${input.deadline}T00:00:00Z`))) {
    throw new CertificationInputError('The deadline is a date, YYYY-MM-DD');
  }
  const data = { deadline: new Date(`${input.deadline}T00:00:00Z`), sourceUrl: httpUrl(input.sourceUrl), notes: input.notes?.trim() || null };
  return db.certificationDeadline.upsert({
    where: { cycle_stateCode: { cycle: CERTIFICATION_CYCLE, stateCode } },
    create: { cycle: CERTIFICATION_CYCLE, stateCode, ...data },
    update: data,
  });
}

/**
 * Records a state-wide event (every federal race in the state), or one race's event when `race` is given
 * (`MN-01`, `GA-SEN`). Returns the races written.
 */
export async function recordEvent(db: PrismaClient, input: {
  state: string; type: RecordableEvent; effectiveAt: string; sourceUrl: string; notes?: string | null; race?: string | null;
}): Promise<{ races: string[] }> {
  const stateCode = state(input.state);
  if (!(input.type in RECORDABLE_EVENTS)) throw new CertificationInputError(`The event is one of ${Object.keys(RECORDABLE_EVENTS).join(', ')}`);
  const effectiveAt = new Date(input.effectiveAt);
  if (Number.isNaN(effectiveAt.getTime())) throw new CertificationInputError('The date is not a date');
  if (effectiveAt.getTime() > Date.now() + 86_400_000) throw new CertificationInputError('The date is in the future');
  if (input.type === 'CORRECTED' && !input.notes?.trim()) throw new CertificationInputError('A correction needs the state’s numbers in the notes');
  const sourceUrl = httpUrl(input.sourceUrl);
  const sourceId = await civicSourceId(db);
  const contests = await stateContests(db, sourceId, stateCode);
  const wanted = input.race?.trim().toUpperCase();
  const chosen = wanted ? contests.filter((contest) => label(contest, stateCode) === wanted) : contests;
  if (chosen.length === 0) throw new CertificationInputError(wanted ? `No 2026 federal race ${wanted}` : `No 2026 federal races in ${stateCode}`);
  await db.certificationEvent.createMany({
    data: chosen.map((contest) => ({
      contestId: contest.id, sourceId, type: input.type, certification: RECORDABLE_EVENTS[input.type],
      effectiveAt, sourceUrl, notes: input.notes?.trim() || null,
    })),
  });
  return { races: chosen.map((contest) => label(contest, stateCode)) };
}

/** Removes an event entered by mistake. Only the most recent event of a race can be removed. */
export async function removeLatestEvent(db: PrismaClient, input: { state: string; race?: string | null }) {
  const stateCode = state(input.state);
  const sourceId = await civicSourceId(db);
  const contests = await stateContests(db, sourceId, stateCode);
  const wanted = input.race?.trim().toUpperCase();
  const chosen = wanted ? contests.filter((contest) => label(contest, stateCode) === wanted) : contests;
  let removed = 0;
  for (const contest of chosen) {
    const latest = await db.certificationEvent.findFirst({ where: { contestId: contest.id }, orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }], select: { id: true } });
    if (latest) {
      await db.certificationEvent.delete({ where: { id: latest.id } });
      removed++;
    }
  }
  return { removed };
}

export interface RaceTotals {
  race: string;
  contestId: string;
  lastChangedAt: string | null;
  totalVotes: number | null;
  counties: number;
  candidates: Array<{ candidacyId: string; name: string; party: string | null; votes: number }>;
  rankedChoice: Array<{ candidacyId: string; round: number; votes: number; isWinner: boolean }>;
}

/** Each race's current race-level totals in a state, to compare with the state's certified results. */
export async function stateTotals(db: PrismaClient, stateInput: string): Promise<RaceTotals[]> {
  const stateCode = state(stateInput);
  const sourceId = await civicSourceId(db);
  const contests = await db.contest.findMany({
    where: { sourceId, stateCode, office: { in: ['US_SENATE', 'US_HOUSE'] }, electionEvent: { cycle: CERTIFICATION_CYCLE } },
    orderBy: [{ office: 'desc' }, { districtCode: 'asc' }],
    select: {
      id: true, office: true, districtCode: true,
      candidacies: { select: { id: true, ballotName: true, person: { select: { displayName: true } }, party: { select: { name: true } } } },
      rankedChoiceRounds: { select: { candidacyId: true, round: true, votes: true, isWinner: true } },
      currentSnapshot: {
        select: {
          countChangedAt: true, publishedAt: true,
          candidateVotes: { where: { voteType: 'TOTAL', reportingUnit: { parentId: null } }, select: { candidacyId: true, votes: true } },
          contestMetrics: { select: { votesCounted: true, reportingUnit: { select: { parentId: true } } } },
        },
      },
    },
  });
  return contests.map((contest) => {
    const names = new Map(contest.candidacies.map((candidacy) => [candidacy.id, { name: candidacy.ballotName ?? candidacy.person.displayName, party: candidacy.party?.name ?? null }]));
    const snapshot = contest.currentSnapshot;
    const root = snapshot?.contestMetrics.find((metric) => metric.reportingUnit.parentId === null);
    return {
      race: label(contest, stateCode),
      contestId: contest.id,
      lastChangedAt: (snapshot?.countChangedAt ?? snapshot?.publishedAt)?.toISOString() ?? null,
      totalVotes: root?.votesCounted === null || root?.votesCounted === undefined ? null : Number(root.votesCounted),
      counties: snapshot ? snapshot.contestMetrics.filter((metric) => metric.reportingUnit.parentId !== null).length : 0,
      candidates: (snapshot?.candidateVotes ?? [])
        .map((vote) => ({ candidacyId: vote.candidacyId, name: names.get(vote.candidacyId)?.name ?? 'Unknown', party: names.get(vote.candidacyId)?.party ?? null, votes: Number(vote.votes) }))
        .sort((a, b) => b.votes - a.votes),
      rankedChoice: contest.rankedChoiceRounds.map((row) => ({ candidacyId: row.candidacyId, round: row.round, votes: Number(row.votes), isWinner: row.isWinner })),
    };
  });
}

/** Replaces a race's ranked-choice final round with the state's (Alaska, Maine). */
export async function setRankedChoiceRound(db: PrismaClient, input: {
  contestId: string; round: number; sourceUrl: string; results: Array<{ candidacyId: string; votes: number; isWinner: boolean }>;
}) {
  if (!Number.isInteger(input.round) || input.round < 1) throw new CertificationInputError('The round is a whole number, 1 or more');
  if (input.results.length < 2) throw new CertificationInputError('A final round has at least two candidates');
  if (input.results.filter((result) => result.isWinner).length !== 1) throw new CertificationInputError('Mark exactly one winner');
  if (input.results.some((result) => !Number.isInteger(result.votes) || result.votes < 0)) throw new CertificationInputError('Votes are whole numbers, 0 or more');
  const sourceUrl = httpUrl(input.sourceUrl);
  const contest = await db.contest.findUnique({ where: { id: input.contestId }, select: { id: true, stateCode: true, candidacies: { select: { id: true } } } });
  if (!contest) throw new CertificationInputError('No such race');
  const candidacies = new Set(contest.candidacies.map((candidacy) => candidacy.id));
  if (input.results.some((result) => !candidacies.has(result.candidacyId))) throw new CertificationInputError('A candidate is not on this race’s ballot');
  await db.$transaction([
    db.rankedChoiceRound.deleteMany({ where: { contestId: contest.id } }),
    db.rankedChoiceRound.createMany({
      data: input.results.map((result) => ({ contestId: contest.id, candidacyId: result.candidacyId, round: input.round, votes: BigInt(result.votes), isWinner: result.isWinner, sourceUrl })),
    }),
  ]);
  return { saved: input.results.length };
}
