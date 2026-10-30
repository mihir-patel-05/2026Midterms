/**
 * Once the primaries are over, keep only the candidates on the general election
 * ballot and delete everyone who lost a primary, with their committees and
 * itemized receipts and disbursements.
 *
 * Nominees are the candidates whose committee filed a pre-general (12G) or
 * post-general (30G) report. FEC rules require those only from candidates who
 * take part in the general election (11 CFR 104.5), so primary losers never
 * file them. A race is pruned only once one of its candidates has filed, so a
 * race with no filings yet is left as it is.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../config/database.js';
import { houseDistrict } from './election.service.js';
import { fecApiService, type FECCommittee } from './fec-api.service.js';

// There are 470 House and Senate races in 2026, most with two nominees. Fewer
// filers than this means the OpenFEC data is incomplete, not that races are empty.
const MIN_NOMINEES = 400;

// Days after the pre-general deadline for OpenFEC to process the reports filed on it.
const FILING_GRACE_DAYS = 3;

const DELETE_BATCH_SIZE = 25;

/** The Tuesday after the first Monday in November, at noon UTC. */
export function generalElectionDate(cycle: number): Date {
  const firstOfMonth = new Date(Date.UTC(cycle, 10, 1, 12));
  const firstMonday = 1 + ((8 - firstOfMonth.getUTCDay()) % 7);
  return new Date(Date.UTC(cycle, 10, firstMonday + 1, 12));
}

/** Pre-general reports are due 12 days before the election; pruning waits a few days more. */
export function pruningOpensOn(cycle: number): Date {
  const date = generalElectionDate(cycle);
  date.setUTCDate(date.getUTCDate() - 12 + FILING_GRACE_DAYS);
  return date;
}

export interface RaceCandidate {
  candidateId: string;
  state: string;
  office: string | null;
  district: string | null;
}

/** `GA-SEN` or `PA-07`. A House filing with a district that does not exist gets a race of its own. */
export function raceOf(candidate: RaceCandidate): string {
  const office = candidate.office?.toUpperCase();
  if (office === 'S' || office === 'SENATE') return `${candidate.state}-SEN`;
  return `${candidate.state}-${houseDistrict(candidate.state, candidate.district) ?? `?${candidate.district ?? ''}`}`;
}

/** Candidates whose committee filed a general election report. */
export function nomineeIds(reports: Array<{ committee_id: string }>, committees: FECCommittee[]): Set<string> {
  const filed = new Set(reports.map((report) => report.committee_id));
  return new Set(
    committees.filter((committee) => filed.has(committee.committee_id)).flatMap((committee) => committee.candidate_ids ?? []),
  );
}

/** Candidates who are not nominees, in races that have at least one nominee. */
export function findPrimaryLosers<T extends RaceCandidate>(candidates: T[], nominees: ReadonlySet<string>): T[] {
  const decided = new Set(candidates.filter((candidate) => nominees.has(candidate.candidateId)).map(raceOf));
  return candidates.filter((candidate) => !nominees.has(candidate.candidateId) && decided.has(raceOf(candidate)));
}

export type NomineeRoster = { ok: true; nominees: Set<string> } | { ok: false; reason: string };

/**
 * The general election candidates for a cycle, or why pruning should not run yet.
 * `committees` is the cycle's House and Senate committee list, which maps each
 * report back to its candidate.
 */
export async function loadNomineeRoster(
  cycle: number,
  committees: FECCommittee[],
  options: { now?: Date; ignoreDate?: boolean } = {},
): Promise<NomineeRoster> {
  const opensOn = pruningOpensOn(cycle);
  if (!options.ignoreDate && (options.now ?? new Date()) < opensOn) {
    return { ok: false, reason: `pre-general reports are not all processed until ${opensOn.toISOString().slice(0, 10)}` };
  }

  const reports = await fecApiService.getGeneralElectionReports(cycle);
  const nominees = nomineeIds(reports, committees);
  if (nominees.size < MIN_NOMINEES) {
    return {
      ok: false,
      reason: `only ${nominees.size} candidates have filed a pre- or post-general report (expected at least ${MIN_NOMINEES})`,
    };
  }
  return { ok: true, nominees };
}

export interface PruneResult {
  races: number;
  kept: Array<{ candidateId: string; name: string; race: string }>;
  dropped: Array<{ candidateId: string; name: string; race: string }>;
  deleted: { candidates: number; committees: number; receipts: number; disbursements: number };
}

/**
 * Delete the primary losers already stored for a cycle. With `apply: false`
 * nothing is deleted and `deleted` counts what would be.
 */
export async function prunePrimaryLosers(
  cycle: number,
  nominees: ReadonlySet<string>,
  options: { apply: boolean; db?: PrismaClient },
): Promise<PruneResult> {
  const db = options.db ?? prisma;
  // A senator elected in another year can list this cycle under `cycles`, but
  // only candidates running this year list it under `electionYears`.
  const candidates = await db.candidate.findMany({
    where: { cycles: { has: cycle }, electionYears: { has: cycle }, office: { in: ['H', 'S'] } },
    select: { candidateId: true, name: true, state: true, office: true, district: true },
  });
  // A candidate confirmed on the ballot (services/ballot) is a nominee, whatever their FEC reports say.
  const confirmed = await db.candidateElection.findMany({
    where: { ballotStatus: 'CONFIRMED', election: { cycle } },
    select: { candidateId: true },
  });
  nominees = new Set([...nominees, ...confirmed.map((link) => link.candidateId)]);
  const losers = findPrimaryLosers(candidates, nominees);
  const withRace = (candidate: (typeof candidates)[number]) => ({
    candidateId: candidate.candidateId,
    name: candidate.name,
    race: raceOf(candidate),
  });
  const dropped = losers.map(withRace);
  const decided = new Set(dropped.map((candidate) => candidate.race));
  const kept = candidates.filter((candidate) => nominees.has(candidate.candidateId)).map(withRace);

  const deleted = { candidates: 0, committees: 0, receipts: 0, disbursements: 0 };
  const loserIds = losers.map((candidate) => candidate.candidateId);
  for (let i = 0; i < loserIds.length; i += DELETE_BATCH_SIZE) {
    const batch = loserIds.slice(i, i + DELETE_BATCH_SIZE);
    const committeeIds = (
      await db.committee.findMany({ where: { candidateId: { in: batch } }, select: { committeeId: true } })
    ).map((committee) => committee.committeeId);
    const byCommittee = { where: { committeeId: { in: committeeIds } } };
    const byCandidate = { where: { candidateId: { in: batch } } };

    if (!options.apply) {
      const [receipts, disbursements] = await Promise.all([db.receipt.count(byCommittee), db.disbursement.count(byCommittee)]);
      deleted.candidates += batch.length;
      deleted.committees += committeeIds.length;
      deleted.receipts += receipts;
      deleted.disbursements += disbursements;
      continue;
    }

    const [receipts, disbursements, , committees, , , , removed] = await db.$transaction([
      db.receipt.deleteMany(byCommittee),
      db.disbursement.deleteMany(byCommittee),
      db.financialSummary.deleteMany(byCommittee),
      db.committee.deleteMany(byCommittee),
      db.candidateElection.deleteMany(byCandidate),
      db.candidateFinancial.deleteMany(byCandidate),
      db.ideologyScore.deleteMany(byCandidate),
      db.candidate.deleteMany(byCandidate),
    ]);
    deleted.candidates += removed.count;
    deleted.committees += committees.count;
    deleted.receipts += receipts.count;
    deleted.disbursements += disbursements.count;
  }

  return { races: new Set([...kept.map((candidate) => candidate.race), ...decided]).size, kept, dropped, deleted };
}
