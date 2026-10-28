/**
 * Admin review of polls the sync could not publish on its own: no race match,
 * a tie between races, or a likely primary. Accepting publishes a poll under
 * a race code (the admin may correct it); rejecting hides it. Either way the
 * decision is stamped with reviewed_at, and later syncs leave it alone.
 */
import type { PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { RACE_CODE } from './poll-read.js';

export class PollNotFoundError extends Error {
  constructor() {
    super('Poll not found');
    this.name = 'PollNotFoundError';
  }
}

export class PollReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollReviewError';
  }
}

/** Office, state, and district from a race code; null for a malformed one. */
export function parseRaceCode(code: string): { office: 'SENATE' | 'HOUSE'; state: string; district: string | null } | null {
  if (!RACE_CODE.test(code)) return null;
  const [state, seat] = code.split('-');
  return seat === 'SEN' ? { office: 'SENATE', state, district: null } : { office: 'HOUSE', state, district: seat };
}

const reviewSelect = {
  id: true,
  source: true,
  externalId: true,
  status: true,
  reviewReason: true,
  raceCode: true,
  office: true,
  state: true,
  district: true,
  pollType: true,
  subject: true,
  pollster: true,
  sponsors: true,
  startDate: true,
  endDate: true,
  sampleSize: true,
  population: true,
  isInternal: true,
  url: true,
  firstSeenAt: true,
  reviewedAt: true,
  reviewedBy: true,
  answers: { orderBy: { sortOrder: 'asc' as const }, select: { choice: true, pct: true, party: true, candidateFecId: true } },
};

type ReviewRow = Awaited<ReturnType<typeof findReviewRow>>;
const findReviewRow = (db: PollsPrismaClient, id: string) => db.poll.findUnique({ where: { id }, select: reviewSelect });

function view(row: NonNullable<ReviewRow>) {
  return {
    ...row,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: row.endDate.toISOString().slice(0, 10),
    answers: row.answers.map((answer) => ({ ...answer, pct: answer.pct.toNumber() })),
  };
}

/** `source` narrows the queue to one source (tests use their own). */
export async function listReviewQueue(db: PollsPrismaClient, options: { limit: number; reason?: string; source?: string }) {
  const queued = { status: 'NEEDS_REVIEW' as const, ...(options.source ? { source: options.source } : {}) };
  const where = { ...queued, ...(options.reason ? { reviewReason: options.reason } : {}) };
  const [rows, total, byReason] = await Promise.all([
    db.poll.findMany({ where, orderBy: [{ endDate: 'desc' }, { firstSeenAt: 'desc' }], take: options.limit, select: reviewSelect }),
    db.poll.count({ where }),
    db.poll.groupBy({ by: ['reviewReason'], where: queued, _count: { _all: true } }),
  ]);
  return {
    total,
    byReason: Object.fromEntries(byReason.map((group) => [group.reviewReason ?? 'unknown', group._count._all])),
    polls: rows.map(view),
  };
}

export async function acceptPoll(db: PollsPrismaClient, id: string, options: { raceCode?: string; reviewer: string; now?: Date }) {
  const row = await findReviewRow(db, id);
  if (!row) throw new PollNotFoundError();
  const code = options.raceCode ?? row.raceCode;
  if (!code) throw new PollReviewError('This poll has no race yet; send a raceCode such as PA-SEN or PA-07');
  const race = parseRaceCode(code);
  if (!race) throw new PollReviewError('raceCode must be a race code such as PA-SEN, PA-07, or AK-00');
  if (row.office && row.office !== race.office) throw new PollReviewError(`This is a ${row.office === 'SENATE' ? 'Senate' : 'House'} poll; ${code} is a ${race.office === 'SENATE' ? 'Senate' : 'House'} race`);
  // Candidate links were made for the matched race; under another race they no longer hold.
  const relink = code !== row.raceCode;
  await db.$transaction([
    ...(relink ? [db.pollAnswer.updateMany({ where: { pollId: id }, data: { candidateFecId: null } })] : []),
    db.poll.update({
      where: { id },
      data: { status: 'PUBLISHED', reviewReason: null, raceCode: code, ...race, reviewedAt: options.now ?? new Date(), reviewedBy: options.reviewer },
    }),
  ]);
  return view((await findReviewRow(db, id))!);
}

export async function rejectPoll(db: PollsPrismaClient, id: string, options: { reviewer: string; now?: Date }) {
  const row = await findReviewRow(db, id);
  if (!row) throw new PollNotFoundError();
  await db.poll.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: options.now ?? new Date(), reviewedBy: options.reviewer } });
  return view((await findReviewRow(db, id))!);
}

/** Recent sync runs and how many polls are in each state, for the admin dashboard. */
export async function pollsStatus(db: PollsPrismaClient) {
  const [runs, byStatus] = await Promise.all([
    db.pollSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, source: true, status: true, startedAt: true, completedAt: true, fetched: true, inserted: true, updated: true, needsReview: true, skipped: true, errorSummary: true },
    }),
    db.poll.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  return { runs, polls: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])) };
}
