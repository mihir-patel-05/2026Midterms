/**
 * Loads the general election ballot for every House and Senate race from civicAPI into the
 * results tables: one `Contest` per race (linked to our `elections` row), and one
 * `Candidacy` per candidate on the ballot, linked to the candidate's FEC record when one
 * matches by name. Matched FEC filings are marked CONFIRMED on the race, so the monitor can
 * show exactly who is on the ballot, including candidates with no FEC record.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { houseDistrict } from '../election.service.js';
import { ballotRaces, raceKey } from '../../utils/races.js';
import { majorParty, matchName, nameParts } from '../../utils/person-name.js';
import { parseAggregate, type BallotCandidate, type BallotRace } from './civicapi-ballot.js';

export const CIVICAPI_SOURCE_KEY = 'civicapi';
const ATTRIBUTION = 'Ballot and results: civicAPI (civicapi.org), aggregated from state and county election offices. Unofficial until certified.';
// Fewer races than this means the aggregate is incomplete or its shape changed; nothing is written.
const MIN_SHARE = 0.9;

export type JsonFetcher = (url: string) => Promise<unknown>;

export interface FecCandidate {
  id: string;
  candidateId: string;
  name: string;
  party: string | null;
}

export interface PlannedCandidate extends BallotCandidate {
  ballotOrder: number;
  fec: FecCandidate | null;
}

export interface BallotSyncReport {
  applied: boolean;
  races: number;
  candidates: number;
  matchedToFec: number;
  racesWithoutCandidates: string[];
  unmatched: string[];
  issues: string[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(env.CIVICAPI_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'User-Agent': 'VoteInformed ballot sync (+https://civicapi.org attribution)' },
  });
  if (!response.ok) throw new Error(`civicAPI ${new URL(url).pathname} returned ${response.status}`);
  return response.json();
}

/**
 * Each ballot candidate with the FEC candidate of the same name in that race. A match
 * whose major party disagrees is refused, and each FEC record is used once.
 */
export function matchBallotToFec(candidates: BallotCandidate[], fec: FecCandidate[]): PlannedCandidate[] {
  const used = new Set<string>();
  return candidates.map((candidate, ballotOrder) => {
    const match = matchName(candidate.name, fec.filter((record) => !used.has(record.candidateId)));
    const ballotParty = majorParty(candidate.party);
    const fecParty = majorParty(match?.party);
    const agrees = match && !(ballotParty && fecParty && ballotParty !== fecParty);
    if (agrees) used.add(match.candidateId);
    return { ...candidate, ballotOrder, fec: agrees ? match : null };
  });
}

/** Both aggregates, parsed and checked against the races on the ballot. Throws when either looks incomplete. */
export async function loadBallot(cycle: number, getJson: JsonFetcher = fetchJson): Promise<{ races: BallotRace[]; issues: string[] }> {
  const expected = ballotRaces(cycle);
  if (!expected) throw new Error(`No race roster for ${cycle}; add it to utils/races.ts first`);
  const base = env.CIVICAPI_BASE_URL.replace(/\/+$/, '');
  const [house, senate] = await Promise.all([
    getJson(`${base}/race/${env.CIVICAPI_HOUSE_RACE_ID}`).then((body) => parseAggregate(body, 'HOUSE', cycle)),
    getJson(`${base}/race/${env.CIVICAPI_SENATE_RACE_ID}`).then((body) => parseAggregate(body, 'SENATE', cycle)),
  ]);
  for (const [office, parsed] of [['HOUSE', house], ['SENATE', senate]] as const) {
    const want = expected.filter((race) => race.officeType === office).length;
    if (parsed.races.length < Math.floor(want * MIN_SHARE)) {
      throw new Error(
        `civicAPI ${office} aggregate has ${parsed.races.length} of ${want} races; not writing. ` +
        `First issues: ${parsed.issues.slice(0, 5).join('; ') || 'none'}`,
      );
    }
  }
  return { races: [...house.races, ...senate.races], issues: [...house.issues, ...senate.issues] };
}

/** FEC candidates running this cycle, keyed by race (`CA-07`, `GA-SEN`). */
async function fecCandidatesByRace(db: PrismaClient, cycle: number): Promise<Map<string, FecCandidate[]>> {
  const rows = await db.candidate.findMany({
    where: { electionYears: { has: cycle }, office: { in: ['H', 'S'] } },
    select: { id: true, candidateId: true, name: true, party: true, state: true, office: true, district: true },
  });
  const byRace = new Map<string, FecCandidate[]>();
  for (const row of rows) {
    const district = row.office === 'H' ? houseDistrict(row.state, row.district) : null;
    if (row.office === 'H' && !district) continue;
    const label = row.office === 'S' ? `${row.state}-SEN` : `${row.state}-${district}`;
    byRace.set(label, [...(byRace.get(label) ?? []), { id: row.id, candidateId: row.candidateId, name: row.name, party: row.party }]);
  }
  return byRace;
}

async function upsertParty(tx: Prisma.TransactionClient, candidate: BallotCandidate, cache: Map<string, string>): Promise<string | null> {
  if (!candidate.party) return null;
  const cached = cache.get(candidate.party);
  if (cached) return cached;
  const party = await tx.party.upsert({
    where: { name_sourceCode: { name: candidate.party, sourceCode: CIVICAPI_SOURCE_KEY } },
    create: { name: candidate.party, abbreviation: candidate.partyCode, sourceCode: CIVICAPI_SOURCE_KEY },
    update: {},
    select: { id: true },
  });
  cache.set(candidate.party, party.id);
  return party.id;
}

/** Writes one race's contest and ballot candidates in one transaction. */
async function writeRace(
  db: PrismaClient,
  ids: { sourceId: string; eventId: string; electionId: string },
  race: BallotRace,
  planned: PlannedCandidate[],
  parties: Map<string, string>,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const contest = await tx.contest.upsert({
      where: { legacyElectionId: ids.electionId },
      create: {
        electionEventId: ids.eventId,
        sourceId: ids.sourceId,
        sourceContestId: race.sourceContestId,
        legacyElectionId: ids.electionId,
        name: race.name,
        office: race.officeType === 'SENATE' ? 'US_SENATE' : 'US_HOUSE',
        officeLevel: 'FEDERAL',
        stateCode: race.state,
        districtCode: race.district,
      },
      update: { sourceId: ids.sourceId, sourceContestId: race.sourceContestId, name: race.name },
      select: { id: true },
    });
    const existing = await tx.candidacy.findMany({
      where: { contestId: contest.id, sourceId: ids.sourceId },
      select: { id: true, personId: true, sourceCandidateId: true, _count: { select: { votes: true } } },
    });
    // Links move between candidacies when a match changes; clear them first so the unique key never collides.
    await tx.candidacy.updateMany({ where: { contestId: contest.id, sourceId: ids.sourceId }, data: { legacyCandidateElectionId: null } });

    const linkIds: string[] = [];
    for (const candidate of planned) {
      let legacyCandidateElectionId: string | null = null;
      if (candidate.fec) {
        const link = await tx.candidateElection.upsert({
          where: { candidateId_electionId: { candidateId: candidate.fec.candidateId, electionId: ids.electionId } },
          create: { candidateId: candidate.fec.candidateId, electionId: ids.electionId, isIncumbent: candidate.isIncumbent, ballotStatus: 'CONFIRMED', result: 'PENDING' },
          update: { ballotStatus: 'CONFIRMED' },
          select: { id: true },
        });
        legacyCandidateElectionId = link.id;
        linkIds.push(link.id);
      }
      const data = {
        partyId: await upsertParty(tx, candidate, parties),
        ballotName: candidate.name,
        ballotOrder: candidate.ballotOrder,
        ballotStatus: 'BALLOT_CONFIRMED' as const,
        isIncumbent: candidate.isIncumbent,
        fecCandidateId: candidate.fec?.candidateId ?? null,
        legacyCandidateId: candidate.fec?.id ?? null,
        legacyCandidateElectionId,
      };
      const parts = nameParts(candidate.name);
      const person = { displayName: candidate.name, normalizedName: candidate.name.toLowerCase(), firstName: parts?.first ?? null, lastName: parts?.last ?? null };
      const current = existing.find((row) => row.sourceCandidateId === candidate.sourceCandidateId);
      if (current) {
        await tx.person.update({ where: { id: current.personId }, data: person });
        await tx.candidacy.update({ where: { id: current.id }, data });
      } else {
        const created = await tx.person.create({ data: person, select: { id: true } });
        await tx.candidacy.create({ data: { ...data, personId: created.id, contestId: contest.id, sourceId: ids.sourceId, sourceCandidateId: candidate.sourceCandidateId } });
      }
    }

    // Candidates no longer on the ballot. Once votes exist they stay, marked withdrawn.
    const current = new Set(planned.map((candidate) => candidate.sourceCandidateId));
    for (const row of existing.filter((candidacy) => !current.has(candidacy.sourceCandidateId ?? ''))) {
      if (row._count.votes > 0) {
        await tx.candidacy.update({ where: { id: row.id }, data: { ballotStatus: 'WITHDRAWN' } });
        continue;
      }
      await tx.candidacy.delete({ where: { id: row.id } });
      if ((await tx.candidacy.count({ where: { personId: row.personId } })) === 0) await tx.person.delete({ where: { id: row.personId } });
    }
    // FEC filings for this race that are not on the ballot.
    await tx.candidateElection.updateMany({
      where: { electionId: ids.electionId, ballotStatus: 'CONFIRMED', id: { notIn: linkIds } },
      data: { ballotStatus: 'UNCONFIRMED' },
    });
  }, { timeout: 30_000 });
}

/**
 * Load the ballot and, with `apply`, write it. Without `apply` nothing is written and the
 * report shows what would be. Races must already exist (`generateElections`).
 */
export async function syncBallot(options: {
  cycle?: number;
  apply: boolean;
  db?: PrismaClient;
  getJson?: JsonFetcher;
}): Promise<BallotSyncReport> {
  const cycle = options.cycle ?? 2026;
  const db = options.db ?? prisma;
  const { races, issues } = await loadBallot(cycle, options.getJson);
  const fecByRace = await fecCandidatesByRace(db, cycle);
  const elections = await db.election.findMany({
    where: { cycle, electionType: 'GENERAL' },
    select: { id: true, state: true, officeType: true, district: true },
  });
  const electionIds = new Map(elections.map((election) => [raceKey(election), election.id]));

  const report: BallotSyncReport = { applied: options.apply, races: 0, candidates: 0, matchedToFec: 0, racesWithoutCandidates: [], unmatched: [], issues };
  const plans = races.flatMap((race) => {
    const electionId = electionIds.get(raceKey(race));
    if (!electionId) {
      issues.push(`${race.label}: no election row; run generateElections first`);
      return [];
    }
    const planned = matchBallotToFec(race.candidates, fecByRace.get(race.label) ?? []);
    report.races++;
    report.candidates += planned.length;
    report.matchedToFec += planned.filter((candidate) => candidate.fec).length;
    if (planned.length === 0) report.racesWithoutCandidates.push(race.label);
    for (const candidate of planned) if (!candidate.fec) report.unmatched.push(`${race.label} ${candidate.name} (${candidate.party ?? 'no party'})`);
    return [{ race, electionId, planned }];
  });
  const missing = (ballotRaces(cycle) ?? []).filter((race) => !races.some((found) => raceKey(found) === raceKey(race)));
  for (const race of missing) issues.push(`${race.state}-${race.officeType === 'SENATE' ? 'SEN' : race.district}: not in civicAPI's aggregate`);
  if (!options.apply) return report;

  const source = await db.dataSource.upsert({
    where: { key: CIVICAPI_SOURCE_KEY },
    // Off for results until the election night plan turns it on; the ballot does not need it.
    create: { key: CIVICAPI_SOURCE_KEY, name: 'civicAPI', type: 'OTHER', homepageUrl: 'https://civicapi.org', attributionText: ATTRIBUTION, expectedCadenceSeconds: 30, isEnabled: false },
    update: {},
    select: { id: true },
  });
  const sourceElectionId = `${cycle}-general`;
  const event = await db.electionEvent.upsert({
    where: { sourceId_sourceElectionId: { sourceId: source.id, sourceElectionId } },
    create: { name: `${cycle} General Election`, electionDate: new Date(`${cycle}-11-03T00:00:00Z`), type: 'GENERAL', cycle, sourceId: source.id, sourceElectionId },
    update: {},
    select: { id: true },
  });
  const parties = new Map<string, string>();
  for (const { race, electionId, planned } of plans) {
    await writeRace(db, { sourceId: source.id, eventId: event.id, electionId }, race, planned, parties);
  }
  return report;
}

export function logBallotReport(report: BallotSyncReport): void {
  const verb = report.applied ? 'Loaded' : 'Would load';
  console.log(`🗳️  ${verb} ${report.candidates} ballot candidates in ${report.races} races; ${report.matchedToFec} matched to an FEC record`);
  if (report.racesWithoutCandidates.length > 0) console.warn(`⚠️  No ballot candidates listed for: ${report.racesWithoutCandidates.join(', ')}`);
  if (report.unmatched.length > 0) console.log(`🗳️  ${report.unmatched.length} ballot candidates have no FEC record: ${report.unmatched.join('; ')}`);
  if (report.issues.length > 0) console.warn(`⚠️  ${report.issues.length} civicAPI issue(s): ${report.issues.join('; ')}`);
}
