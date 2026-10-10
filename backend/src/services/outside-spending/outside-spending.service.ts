/**
 * Outside spending totals from stored Schedule E lines.
 *
 * What counts:
 * - Memo lines never count; they describe spending reported elsewhere.
 * - Regular-report lines always count.
 * - A 24/48-hour notice counts only when it is dated after the latest line the
 *   same committee has filed on a regular report. Earlier notices have already
 *   been repeated on that report, and counting both would double the money.
 *
 * Support and opposition are always shown separately and never netted.
 */
import type { IndependentExpenditure, PrismaClient } from '@prisma/client';
import { COMMUNICATION_TYPES } from './schedule-e.js';

export interface SpendingSplit {
  support: number;
  oppose: number;
  total: number;
}

export interface OutsideSpendingCoverage {
  /** "not_synced" until the first run finishes its recent window. */
  status: 'not_synced' | 'backfilling' | 'complete';
  lastSyncedAt: string | null;
  latestExpenditureDate: string | null;
}

export interface CandidateOutsideSpending extends SpendingSplit {
  cycle: number;
  candidateId: string;
  candidateName: string | null;
  count: number;
  /** Money counted from 24/48-hour notices not yet repeated on a regular report. */
  fromNotices: number;
  bySpender: Array<SpendingSplit & { committeeId: string; committeeName: string }>;
  byType: Array<SpendingSplit & { type: string }>;
  recent: Array<{
    date: string | null;
    committeeId: string;
    committeeName: string;
    amount: number;
    supportOppose: 'S' | 'O';
    description: string | null;
    type: string;
    isNotice: boolean;
    pdfUrl: string | null;
  }>;
  coverage: OutsideSpendingCoverage;
}

export interface RaceOutsideSpending {
  cycle: number;
  state: string;
  office: 'H' | 'S';
  district: string | null;
  candidates: Array<SpendingSplit & { candidateId: string | null; candidateName: string | null }>;
  topSpenders: Array<SpendingSplit & { committeeId: string; committeeName: string }>;
  total: number;
  coverage: OutsideSpendingCoverage;
}

type Row = Pick<IndependentExpenditure,
  'committeeId' | 'committeeName' | 'candidateId' | 'candidateName' | 'supportOppose' | 'amount' | 'expenditureDate'
  | 'description' | 'communicationType' | 'isNotice' | 'isMemo' | 'pdfUrl' | 'fetchedAt'>;

const ROW_SELECT = {
  committeeId: true, committeeName: true, candidateId: true, candidateName: true, supportOppose: true, amount: true,
  expenditureDate: true, description: true, communicationType: true, isNotice: true, isMemo: true, pdfUrl: true, fetchedAt: true,
} as const;

type Db = Pick<PrismaClient, 'independentExpenditure' | 'scheduleESyncState'>;

const cents = (value: number) => Math.round(value * 100) / 100;
const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function split(rows: Row[]): SpendingSplit {
  let support = 0;
  let oppose = 0;
  for (const row of rows) {
    if (row.supportOppose === 'S') support += Number(row.amount);
    else oppose += Number(row.amount);
  }
  return { support: cents(support), oppose: cents(oppose), total: cents(support + oppose) };
}

function groupBy<K>(rows: Row[], key: (row: Row) => K) {
  const groups = new Map<K, Row[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) group.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

/** Latest regular-report expenditure date per committee, for the notice rule. */
async function regularCutoffs(db: Db, cycle: number, committeeIds: string[]) {
  if (committeeIds.length === 0) return new Map<string, Date | null>();
  const grouped = await db.independentExpenditure.groupBy({
    by: ['committeeId'],
    where: { cycle, committeeId: { in: committeeIds }, isNotice: false, isMemo: false },
    _max: { expenditureDate: true },
  });
  return new Map(grouped.map((group) => [group.committeeId, group._max.expenditureDate]));
}

/** Apply the counting rules above. */
export function countable(rows: Row[], cutoffs: Map<string, Date | null>): Row[] {
  return rows.filter((row) => {
    if (row.isMemo) return false;
    if (!row.isNotice) return true;
    const cutoff = cutoffs.get(row.committeeId);
    if (!cutoff) return true;
    return row.expenditureDate !== null && row.expenditureDate > cutoff;
  });
}

async function coverage(db: Db, cycle: number, rows: Row[]): Promise<OutsideSpendingCoverage> {
  const state = await db.scheduleESyncState.findUnique({ where: { cycle } });
  const latest = rows.reduce<Date | null>((max, row) => (row.expenditureDate && (!max || row.expenditureDate > max) ? row.expenditureDate : max), null);
  return {
    status: !state?.lastWindowSyncedAt ? 'not_synced' : state.backfillComplete ? 'complete' : 'backfilling',
    lastSyncedAt: state?.lastWindowSyncedAt?.toISOString() ?? null,
    latestExpenditureDate: day(latest),
  };
}

function spenders(rows: Row[], limit: number) {
  return [...groupBy(rows, (row) => row.committeeId)]
    .map(([committeeId, group]) => ({ committeeId, committeeName: group[0].committeeName, ...split(group) }))
    .sort((a, b) => b.total - a.total || a.committeeName.localeCompare(b.committeeName))
    .slice(0, limit);
}

export async function getCandidateOutsideSpending(db: Db, fecCandidateId: string, cycle: number): Promise<CandidateOutsideSpending> {
  const all = await db.independentExpenditure.findMany({ where: { cycle, candidateId: fecCandidateId }, select: ROW_SELECT });
  const rows = countable(all, await regularCutoffs(db, cycle, [...new Set(all.map((row) => row.committeeId))]));
  const byType = groupBy(rows, (row) => row.communicationType);
  const recent = [...rows]
    .sort((a, b) => (b.expenditureDate?.getTime() ?? 0) - (a.expenditureDate?.getTime() ?? 0) || Number(b.amount) - Number(a.amount))
    .slice(0, 10);

  return {
    cycle,
    candidateId: fecCandidateId,
    candidateName: all.find((row) => row.candidateName)?.candidateName ?? null,
    ...split(rows),
    count: rows.length,
    fromNotices: cents(rows.filter((row) => row.isNotice).reduce((sum, row) => sum + Number(row.amount), 0)),
    bySpender: spenders(rows, 10),
    byType: COMMUNICATION_TYPES
      .filter((type) => byType.has(type))
      .map((type) => ({ type, ...split(byType.get(type)!) }))
      .sort((a, b) => b.total - a.total),
    recent: recent.map((row) => ({
      date: day(row.expenditureDate),
      committeeId: row.committeeId,
      committeeName: row.committeeName,
      amount: Number(row.amount),
      supportOppose: row.supportOppose === 'S' ? 'S' : 'O',
      description: row.description,
      type: row.communicationType,
      isNotice: row.isNotice,
      pdfUrl: row.pdfUrl,
    })),
    coverage: await coverage(db, cycle, rows),
  };
}

export async function getRaceOutsideSpending(
  db: Db,
  race: { state: string; office: 'H' | 'S'; district: string | null; cycle: number },
): Promise<RaceOutsideSpending> {
  const { state, office, district, cycle } = race;
  const all = await db.independentExpenditure.findMany({
    where: { cycle, candidateState: state, candidateOffice: office, ...(office === 'H' ? { candidateDistrict: district } : {}) },
    select: ROW_SELECT,
  });
  const rows = countable(all, await regularCutoffs(db, cycle, [...new Set(all.map((row) => row.committeeId))]));
  const candidates = [...groupBy(rows, (row) => row.candidateId)]
    .map(([candidateId, group]) => ({ candidateId, candidateName: group.find((row) => row.candidateName)?.candidateName ?? null, ...split(group) }))
    .sort((a, b) => b.total - a.total);

  return {
    cycle,
    state,
    office,
    district: office === 'H' ? district : null,
    candidates,
    topSpenders: spenders(rows, 5),
    total: split(rows).total,
    coverage: await coverage(db, cycle, rows),
  };
}
