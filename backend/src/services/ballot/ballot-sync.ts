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
import { candidateService } from '../candidate.service.js';
import { financeService } from '../finance.service.js';
import { fecApiService, type FECCandidate } from '../fec-api.service.js';
import { ballotRaces, raceKey } from '../../utils/races.js';
import { majorParty, nameParts, sameFirstName, sharesSurname } from '../../utils/person-name.js';
import { parseAggregate, type BallotCandidate, type BallotRace } from './civicapi-ballot.js';

export const CIVICAPI_SOURCE_KEY = 'civicapi';
const ATTRIBUTION = 'Ballot and results: civicAPI (civicapi.org), aggregated from state and county election offices. Unofficial until certified.';
// Fewer races than this means the aggregate is incomplete or its shape changed; nothing is written.
const MIN_SHARE = 0.9;
// OpenFEC name searches per run, for major-party nominees the FEC sync never loaded.
const MAX_FEC_LOOKUPS = 60;

export type JsonFetcher = (url: string) => Promise<unknown>;

export interface FecCandidate {
  id: string;
  candidateId: string;
  name: string;
  party: string | null;
  /** The race FEC files them under (`CA-07`, `GA-SEN`). */
  race: string;
  /** Receipts this cycle, to choose between duplicate records of one person. */
  receipts: number;
}

export interface PlannedCandidate extends BallotCandidate {
  ballotOrder: number;
  fec: FecCandidate | null;
  /** Why no FEC record is linked, for the log. */
  noMatch?: string;
  /** How the FEC record was chosen when there was more than one, for the log. */
  picked?: string;
}

export interface BallotSyncReport {
  applied: boolean;
  races: number;
  /** Candidates printed on the ballot; declared write-ins are counted separately. */
  candidates: number;
  matchedToFec: number;
  /** Matched to an FEC record filed under another district, usually after a redraw. */
  crossDistrict: string[];
  /** Matched to one of several FEC records for the same person. */
  duplicatesResolved: string[];
  /** Found by an OpenFEC name search and loaded (or, in a dry run, would be). */
  loadedFromFec: string[];
  writeIns: string[];
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

const NO_SURNAME = 'no FEC filer with that surname in this race';

/** False only when both name a major party and they differ. */
function partiesAgree(ballot: string | null, fec: string | null): boolean {
  const a = majorParty(ballot);
  const b = majorParty(fec);
  return !(a && b && a !== b);
}

const sameSurname = (name: string, records: readonly FecCandidate[]) => records.filter((record) => sharesSurname(name, record.name));

/**
 * FEC often holds two records for one person (`HARRIS, MARK E` twice, `MENENDEZ, ROBERT` and
 * `MENENDEZ, ROBERT J.`). The one that raised the most this cycle is the campaign's.
 */
function bestFunded(records: readonly FecCandidate[]): { record: FecCandidate; of: number } {
  const [record] = [...records].sort((a, b) => b.receipts - a.receipts || a.candidateId.localeCompare(b.candidateId));
  return { record, of: records.length };
}

/**
 * Round 1: the record with this surname when only one person in FEC has it (one record, or
 * duplicates under one name) and no one else on this ballot shares it; otherwise the record(s)
 * with this exact first name. Exact first names keep two real people apart ("Dan Sullivan"
 * and "Daniel J. Sullivan" both ran in AK-SEN).
 */
function pickBySurname(candidate: BallotCandidate, pool: readonly FecCandidate[], surnameOnBallot: number) {
  const target = nameParts(candidate.name);
  if (!target) return null;
  const agree = sameSurname(candidate.name, pool).filter((record) => partiesAgree(candidate.party, record.party));
  const firstNames = new Set(agree.map((record) => nameParts(record.name)?.first));
  if (agree.length > 0 && firstNames.size === 1 && surnameOnBallot === 1) return bestFunded(agree);
  const exact = agree.filter((record) => nameParts(record.name)?.first === target.first);
  return exact.length > 0 ? bestFunded(exact) : null;
}

/** Round 2: records with this surname and a matching first name or nickname ("Rob", "Bob" and ROBERT), the best funded if several. */
function pickByFirstName(candidate: BallotCandidate, pool: readonly FecCandidate[]) {
  const first = nameParts(candidate.name)?.first;
  if (!first) return null;
  const agree = sameSurname(candidate.name, pool)
    .filter((record) => sameFirstName(first, nameParts(record.name)?.first ?? '') && partiesAgree(candidate.party, record.party));
  return agree.length > 0 ? bestFunded(agree) : null;
}

const pickNote = (pick: { record: FecCandidate; of: number }) => (pick.of > 1 ? `the best funded of ${pick.of} records` : undefined);

/**
 * Each ballot candidate with their FEC record in that race: first every unique surname or
 * exact first name, then by first name or nickname among the records left. Among duplicate records the
 * best funded wins (`picked` says so). A major-party conflict is never matched, each record
 * is used once, and declared write-ins are not matched. `noMatch` says why a candidate has
 * no FEC record.
 */
export function matchBallotToFec(candidates: BallotCandidate[], fec: FecCandidate[]): PlannedCandidate[] {
  const used = new Set<string>();
  const free = () => fec.filter((record) => !used.has(record.candidateId));
  const onBallot = candidates.filter((candidate) => !candidate.writeIn);
  const planned: PlannedCandidate[] = candidates.map((candidate, ballotOrder) => {
    if (candidate.writeIn) return { ...candidate, ballotOrder, fec: null, noMatch: 'declared write-in' };
    const pick = pickBySurname(candidate, free(), onBallot.filter((other) => sharesSurname(other.name, candidate.name)).length);
    if (!pick) return { ...candidate, ballotOrder, fec: null };
    used.add(pick.record.candidateId);
    return { ...candidate, ballotOrder, fec: pick.record, picked: pickNote(pick) };
  });
  return planned.map((candidate) => {
    if (candidate.fec || candidate.writeIn) return candidate;
    const pick = pickByFirstName(candidate, free());
    if (pick) {
      used.add(pick.record.candidateId);
      return { ...candidate, fec: pick.record, picked: pickNote(pick) };
    }
    const same = sameSurname(candidate.name, fec);
    const conflict = same.find((record) => !partiesAgree(candidate.party, record.party));
    const noMatch = same.length === 0
      ? NO_SURNAME
      : same.every((record) => used.has(record.candidateId))
        ? `${same.map((record) => record.name).join(' / ')} already matched another ballot name`
        : conflict && same.every((record) => used.has(record.candidateId) || !partiesAgree(candidate.party, record.party))
          ? `FEC lists ${conflict.name} as ${conflict.party ?? 'no party'}`
          : `${same.length} FEC filers share the surname: ${same.map((record) => record.name).join(' / ')}`;
    return { ...candidate, noMatch };
  });
}

/**
 * Second pass for candidates with no same-surname filer in their own race: an FEC record in
 * the same state and chamber, filed under another district (as after a redraw), with the same
 * surname and first name (or nickname) and no major-party conflict. Each record is still used once.
 * Otherwise `noMatch` names where FEC has that surname in the state, if anywhere.
 */
export function matchAcrossDistricts(
  race: { state: string; officeType: string },
  planned: PlannedCandidate[],
  stateFilers: readonly FecCandidate[],
  used: Set<string>,
): PlannedCandidate[] {
  const chamber = (record: FecCandidate) => (record.race.endsWith('-SEN') ? 'SENATE' : 'HOUSE');
  return planned.map((candidate) => {
    if (candidate.fec || candidate.noMatch !== NO_SURNAME) return candidate;
    const pool = stateFilers.filter((record) => chamber(record) === race.officeType && !used.has(record.candidateId));
    const pick = pickByFirstName(candidate, pool);
    if (pick) {
      used.add(pick.record.candidateId);
      return { ...candidate, fec: pick.record, picked: pickNote(pick), noMatch: undefined };
    }
    const elsewhere = sameSurname(candidate.name, stateFilers);
    return elsewhere.length === 0
      ? candidate
      : { ...candidate, noMatch: `${NO_SURNAME}; FEC has ${elsewhere.map((record) => `${record.name} (${record.race})`).join(', ')}` };
  });
}

/** OpenFEC name search and loading, injectable for tests. */
export interface FecLookup {
  search(surname: string, state: string, office: 'H' | 'S'): Promise<FECCandidate[]>;
  /** Saves the record and its totals for the cycle; returns it as a match target in `race`. */
  load(record: FECCandidate, cycle: number, race: string): Promise<FecCandidate>;
}

const openFecLookup: FecLookup = {
  search: (surname, state, office) => fecApiService.searchCandidates({ name: surname, state, office }),
  async load(record, cycle, race) {
    const row = await candidateService.upsertCandidate(record);
    await financeService.syncCandidateFinancials(record.candidate_id, cycle);
    const totals = await prisma.candidateFinancial.findUnique({
      where: { candidateId_cycle: { candidateId: record.candidate_id, cycle } },
      select: { receipts: true },
    });
    return { id: row.id, candidateId: row.candidateId, name: row.name, party: row.party, race, receipts: Number(totals?.receipts ?? 0) };
  },
};

/**
 * The search result that is this ballot candidate: same surname and first name (or nickname),
 * no major-party conflict. Prefers a record running this cycle, then an exact first name, then
 * the latest `active_through`.
 */
export function pickSearchResult(candidate: BallotCandidate, results: readonly FECCandidate[], cycle: number): FECCandidate | null {
  const target = nameParts(candidate.name);
  if (!target?.first) return null;
  const score = (record: FECCandidate) => [
    record.election_years?.includes(cycle) || record.cycles?.includes(cycle) ? 1 : 0,
    nameParts(record.name)?.first === target.first ? 1 : 0,
    record.active_through ?? 0,
  ];
  const fits = results.filter((record) => {
    const parts = nameParts(record.name);
    return parts && sharesSurname(candidate.name, record.name) && sameFirstName(target.first, parts.first) && partiesAgree(candidate.party, record.party ?? null);
  });
  return fits.sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  })[0] ?? null;
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
/**
 * FEC candidates running this cycle, keyed by race (`CA-07`, `GA-SEN`). Records an earlier run
 * confirmed on a ballot count too, even when FEC does not list this cycle for them.
 */
async function fecCandidatesByRace(db: PrismaClient, cycle: number): Promise<Map<string, FecCandidate[]>> {
  const rows = await db.candidate.findMany({
    where: {
      office: { in: ['H', 'S'] },
      OR: [
        { electionYears: { has: cycle } },
        { candidateElections: { some: { ballotStatus: 'CONFIRMED', election: { cycle } } } },
      ],
    },
    select: {
      id: true, candidateId: true, name: true, party: true, state: true, office: true, district: true,
      financials: { where: { cycle }, select: { receipts: true }, take: 1 },
    },
  });
  const byRace = new Map<string, FecCandidate[]>();
  for (const row of rows) {
    const record = toFecCandidate(row);
    if (record) byRace.set(record.race, [...(byRace.get(record.race) ?? []), record]);
  }
  return byRace;
}

/** Our candidate row as a match target; null for a House filing under a district that does not exist. */
function toFecCandidate(row: {
  id: string; candidateId: string; name: string; party: string | null; state: string; office: string; district: string | null;
  financials?: Array<{ receipts: unknown }>;
}): FecCandidate | null {
  const district = row.office === 'H' ? houseDistrict(row.state, row.district) : null;
  if (row.office === 'H' && !district) return null;
  const race = row.office === 'S' ? `${row.state}-SEN` : `${row.state}-${district}`;
  return { id: row.id, candidateId: row.candidateId, name: row.name, party: row.party, race, receipts: Number(row.financials?.[0]?.receipts ?? 0) };
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
        ballotStatus: candidate.writeIn ? ('WRITE_IN' as const) : ('BALLOT_CONFIRMED' as const),
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
  /** Null skips the OpenFEC search; the default needs FEC_API_KEY. */
  fecLookup?: FecLookup | null;
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

  const report: BallotSyncReport = {
    applied: options.apply, races: 0, candidates: 0, matchedToFec: 0, crossDistrict: [], duplicatesResolved: [], loadedFromFec: [],
    writeIns: [], racesWithoutCandidates: [], unmatched: [], issues,
  };
  const firstPass = races.flatMap((race) => {
    const electionId = electionIds.get(raceKey(race));
    if (!electionId) {
      issues.push(`${race.label}: no election row; run generateElections first`);
      return [];
    }
    return [{ race, electionId, planned: matchBallotToFec(race.candidates, fecByRace.get(race.label) ?? []) }];
  });
  // Records matched in their own race are taken before any cross-district match is tried.
  const used = new Set(firstPass.flatMap(({ planned }) => planned.flatMap((candidate) => (candidate.fec ? [candidate.fec.candidateId] : []))));
  const byState = new Map<string, FecCandidate[]>();
  for (const [label, records] of fecByRace) byState.set(label.slice(0, 2), [...(byState.get(label.slice(0, 2)) ?? []), ...records]);
  const secondPass = firstPass.map(({ race, electionId, planned }) => ({
    race, electionId, planned: matchAcrossDistricts(race, planned, byState.get(race.state) ?? [], used),
  }));

  // Third pass: major-party nominees with no record of that surname, looked up in OpenFEC by name.
  const lookup = options.fecLookup === undefined ? (env.FEC_API_KEY ? openFecLookup : null) : options.fecLookup;
  const wanted = secondPass.flatMap(({ race, planned }) => planned
    .filter((candidate) => !candidate.fec && !candidate.writeIn && majorParty(candidate.party) && candidate.noMatch?.startsWith(NO_SURNAME))
    .map((candidate) => ({ race, candidate })));
  if (wanted.length > 0 && !lookup) issues.push(`${wanted.length} major-party candidates have no FEC record; set FEC_API_KEY to search OpenFEC for them`);
  if (wanted.length > MAX_FEC_LOOKUPS) issues.push(`${wanted.length} candidates need an OpenFEC search; searched the first ${MAX_FEC_LOOKUPS}`);
  for (const { race, candidate } of lookup ? wanted.slice(0, MAX_FEC_LOOKUPS) : []) {
    const surname = nameParts(candidate.name)?.last;
    if (!surname) continue;
    try {
      const results = await lookup!.search(surname.toLowerCase(), race.state, race.officeType === 'SENATE' ? 'S' : 'H');
      const found = pickSearchResult(candidate, results.filter((record) => !used.has(record.candidate_id)), cycle);
      if (!found) {
        candidate.noMatch = `${candidate.noMatch}; OpenFEC has no ${surname} matching this candidate`;
        continue;
      }
      used.add(found.candidate_id);
      report.loadedFromFec.push(`${race.label} ${candidate.name} = ${found.name} (${found.candidate_id})`);
      if (!options.apply) continue;
      candidate.fec = await lookup!.load(found, cycle, race.label);
      candidate.noMatch = undefined;
    } catch (error) {
      issues.push(`${race.label} ${candidate.name}: OpenFEC search failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  const plans = secondPass.map(({ race, electionId, planned: matched }) => {
    const onBallot = matched.filter((candidate) => !candidate.writeIn);
    report.races++;
    report.candidates += onBallot.length;
    report.matchedToFec += onBallot.filter((candidate) => candidate.fec).length;
    if (onBallot.length === 0) report.racesWithoutCandidates.push(race.label);
    for (const candidate of matched) {
      if (candidate.writeIn) report.writeIns.push(`${race.label} ${candidate.name}`);
      else if (!candidate.fec) report.unmatched.push(`${race.label} ${candidate.name} (${candidate.party ?? 'no party'}): ${candidate.noMatch}`);
      else if (candidate.fec.race !== race.label) report.crossDistrict.push(`${race.label} ${candidate.name} = ${candidate.fec.name}, filed under ${candidate.fec.race}`);
      if (candidate.fec && candidate.picked) report.duplicatesResolved.push(`${race.label} ${candidate.name} = ${candidate.fec.name} (${candidate.fec.candidateId}), ${candidate.picked}`);
    }
    return { race, electionId, planned: matched };
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
  if (report.duplicatesResolved.length > 0) console.log(`🗳️  ${report.duplicatesResolved.length} matched among duplicate FEC records: ${report.duplicatesResolved.join('; ')}`);
  if (report.loadedFromFec.length > 0) console.log(`🗳️  ${report.loadedFromFec.length} ${report.applied ? 'loaded' : 'would be loaded'} from an OpenFEC name search: ${report.loadedFromFec.join('; ')}`);
  if (report.crossDistrict.length > 0) console.log(`🗳️  ${report.crossDistrict.length} matched to an FEC record filed under another district: ${report.crossDistrict.join('; ')}`);
  if (report.writeIns.length > 0) console.log(`🗳️  ${report.writeIns.length} declared write-ins kept off the ballot list: ${report.writeIns.join('; ')}`);
  if (report.racesWithoutCandidates.length > 0) console.warn(`⚠️  No ballot candidates listed for: ${report.racesWithoutCandidates.join(', ')}`);
  if (report.unmatched.length > 0) console.log(`🗳️  ${report.unmatched.length} ballot candidates have no FEC record: ${report.unmatched.join('; ')}`);
  if (report.issues.length > 0) console.warn(`⚠️  ${report.issues.length} civicAPI issue(s): ${report.issues.join('; ')}`);
}
