/**
 * Pure parsing of civicAPI result documents (docs/plans/civicapi-results.md, "Parse"). Two kinds:
 *
 * - **Aggregates** (`/race/87528` Senate, `/race/87524` House): one region per race, keyed `pa`,
 *   `pa-07`, `ak-al`, each with the race's `election_id`, `percent_reporting` and candidates. The
 *   document's `last_updated` covers the whole feed.
 * - **Detail** (`/race/{election_id}`): one race, with its own `last_updated`, `called_at`, and
 *   `region_results` holding its counties (`fips`, `percent_reporting`, candidates without ids).
 *
 * Nothing here throws on an unexpected shape: a bad race becomes an ERROR issue and is left out, a
 * doubtful one publishes with a WARNING issue. Numbers stay as civicAPI reports them; nothing is
 * filled in. civicAPI's `winner` flag is its decision desk's call (civicapi.org/faq).
 */
import { candidateIdentity, isPlaceholderCandidate, normalizedName, raceFromRegion } from '../../../services/ballot/civicapi-ballot.js';
import { raceLabel, type Race } from '../../../utils/races.js';
import type { ResultsParseIssue } from '../parser.js';

export const CIVICAPI_PARSER_VERSION = 'civicapi/1.0.0';

export interface CandidateTally {
  /** Matches `Candidacy.sourceCandidateId` from the ballot sync. */
  sourceCandidateId: string;
  name: string;
  party: string | null;
  partyCode: string;
  writeIn: boolean;
  votes: number;
  /** civicAPI's share, 0–100, or null when it gave none. */
  percent: number | null;
  /** civicAPI's decision desk called the race for this candidate. */
  winner: boolean;
  /** Advances to a runoff (civicAPI's `advanced`). */
  advanced: boolean;
  isIncumbent: boolean;
}

export interface CountyTally {
  fips: string;
  name: string;
  percentReporting: number | null;
  /** Votes on placeholder rows ("Write-ins", "Scattering") count toward the total but name no one. */
  otherVotes: number;
  candidates: CandidateTally[];
}

export interface RaceUpdate {
  race: Race;
  /** `PA-07`, `GA-SEN`. */
  label: string;
  /** civicAPI's `election_id`, which is `Contest.sourceContestId`. */
  sourceContestId: string;
  name: string;
  /** civicAPI's estimate of the share of the expected vote counted, 0–100; never a precinct count. */
  percentReporting: number | null;
  /** The document's own update time, or null. */
  lastUpdated: string | null;
  /** When civicAPI called the race (detail documents only). */
  calledAt: string | null;
  otherVotes: number;
  candidates: CandidateTally[];
  /** Detail documents only; null for aggregate rows. */
  counties: CountyTally[] | null;
}

export interface ParsedDocument {
  kind: 'aggregate' | 'detail';
  /** civicAPI marks rehearsal numbers with `test_data: true`. */
  testData: boolean;
  lastUpdated: string | null;
  races: RaceUpdate[];
  issues: ResultsParseIssue[];
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoTime(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** A share in 0–100, or an issue. */
function percent(value: unknown, path: string, issues: ResultsParseIssue[]): number | null | undefined {
  const parsed = number(value);
  if (parsed === null) return null;
  if (parsed < 0 || parsed > 100) {
    issues.push({ severity: 'ERROR', code: 'PERCENT_OUT_OF_RANGE', message: `${path} is ${parsed}, outside 0–100` });
    return undefined;
  }
  return parsed;
}

const flag = (value: unknown) => value === true || value === 'true';

/** Candidates of one race or county. Undefined when a row makes the whole unit unusable. */
function parseTallies(value: unknown, path: string, issues: ResultsParseIssue[]): { candidates: CandidateTally[]; otherVotes: number } | undefined {
  if (!Array.isArray(value)) {
    issues.push({ severity: 'ERROR', code: 'NO_CANDIDATES', message: `${path} has no candidate list` });
    return undefined;
  }
  const candidates: CandidateTally[] = [];
  const seen = new Set<string>();
  let otherVotes = 0;
  for (const [index, item] of value.entries()) {
    const row = record(item);
    const name = text(row?.name);
    if (!row || !name) {
      issues.push({ severity: 'WARNING', code: 'CANDIDATE_WITHOUT_NAME', message: `${path} candidate ${index} has no name; skipped` });
      continue;
    }
    const votes = number(row.votes) ?? 0;
    if (votes < 0 || !Number.isInteger(votes)) {
      issues.push({ severity: 'ERROR', code: 'INVALID_VOTES', message: `${path} ${name} has ${row.votes} votes` });
      return undefined;
    }
    if (isPlaceholderCandidate(name)) {
      otherVotes += votes;
      continue;
    }
    const share = percent(row.percent, `${path} ${name} percent`, issues);
    if (share === undefined) return undefined;
    const identity = candidateIdentity(row);
    if (seen.has(identity.sourceCandidateId)) {
      issues.push({ severity: 'WARNING', code: 'DUPLICATE_CANDIDATE', message: `${path} lists ${name} twice; kept the first` });
      continue;
    }
    seen.add(identity.sourceCandidateId);
    candidates.push({
      ...identity,
      votes,
      percent: share,
      winner: flag(row.winner),
      advanced: flag(row.advanced),
      isIncumbent: flag(row.incumbent),
    });
  }
  return { candidates, otherVotes };
}

/** County rows carry no candidate id, so they take the race's id by name and party. */
function linkCountyCandidates(county: CandidateTally[], race: CandidateTally[]): CandidateTally[] {
  const byName = new Map(race.map((candidate) => [`${normalizedName(candidate.name)}|${candidate.partyCode}`, candidate]));
  const byNameOnly = new Map<string, CandidateTally | null>();
  for (const candidate of race) {
    const key = normalizedName(candidate.name);
    byNameOnly.set(key, byNameOnly.has(key) ? null : candidate);
  }
  return county.map((candidate) => {
    const match = byName.get(`${normalizedName(candidate.name)}|${candidate.partyCode}`) ?? byNameOnly.get(normalizedName(candidate.name)) ?? null;
    return match ? { ...candidate, sourceCandidateId: match.sourceCandidateId, winner: false, advanced: false } : { ...candidate, winner: false, advanced: false };
  });
}

function parseCounties(value: unknown, label: string, race: CandidateTally[], issues: ResultsParseIssue[]): CountyTally[] {
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(record(value) ?? {});
  const counties: CountyTally[] = [];
  const seen = new Set<string>();
  let skippedTowns = 0;
  for (const [key, item] of entries) {
    const region = record(item);
    if (!region) continue;
    const fips = text(region.fips);
    const name = text(region.name) || key;
    if (!/^\d{5}$/.test(fips)) {
      // New England reports towns; v1 keeps counties only and logs them once per race.
      skippedTowns++;
      continue;
    }
    if (seen.has(fips)) {
      issues.push({ severity: 'WARNING', code: 'DUPLICATE_COUNTY', message: `${label} lists county ${fips} twice; kept the first` });
      continue;
    }
    const share = percent(region.percent_reporting, `${label} ${name} percent_reporting`, issues);
    const tallies = parseTallies(region.candidates, `${label} ${name}`, issues);
    if (share === undefined || !tallies) continue;
    seen.add(fips);
    counties.push({ fips, name, percentReporting: share, otherVotes: tallies.otherVotes, candidates: linkCountyCandidates(tallies.candidates, race) });
  }
  if (skippedTowns > 0) {
    issues.push({ severity: 'WARNING', code: 'NON_COUNTY_UNITS', message: `${label}: ${skippedTowns} units without a 5-digit county FIPS (towns) left out` });
  }
  return counties.sort((a, b) => a.fips.localeCompare(b.fips));
}

/** One race, from an aggregate region or a detail document. Null when it is unusable. */
function parseRace(
  body: Json,
  race: Race,
  sourceContestId: string,
  options: { lastUpdated: string | null; calledAt: string | null; counties: unknown | null },
  issues: ResultsParseIssue[],
): RaceUpdate | null {
  const label = raceLabel(race);
  const share = percent(body.percent_reporting, `${label} percent_reporting`, issues);
  const tallies = parseTallies(body.candidates, label, issues);
  if (share === undefined || !tallies) return null;
  if (tallies.candidates.length === 0) {
    issues.push({ severity: 'ERROR', code: 'NO_CANDIDATES', message: `${label} has no candidates` });
    return null;
  }
  return {
    race,
    label,
    sourceContestId,
    name: text(body.name) || text(body.election_name) || label,
    percentReporting: share,
    lastUpdated: options.lastUpdated,
    calledAt: options.calledAt,
    otherVotes: tallies.otherVotes,
    candidates: tallies.candidates,
    counties: options.counties === null ? null : parseCounties(options.counties, label, tallies.candidates, issues),
  };
}

/** A Senate (`officeType` SENATE) or House aggregate. */
export function parseAggregateResults(body: unknown, officeType: Race['officeType'], cycle: number): ParsedDocument {
  const issues: ResultsParseIssue[] = [];
  const root = record(body);
  const lastUpdated = isoTime(root?.last_updated);
  if (!lastUpdated) issues.push({ severity: 'WARNING', code: 'NO_LAST_UPDATED', message: `${officeType} aggregate has no last_updated; fetch time used` });
  const regions = record(root?.region_results);
  if (!regions) issues.push({ severity: 'ERROR', code: 'NO_REGIONS', message: `${officeType} aggregate has no region_results` });

  const races: RaceUpdate[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(regions ?? {})) {
    const region = record(value);
    const race = raceFromRegion(key, officeType, cycle);
    if (!region || !race) {
      issues.push({ severity: 'WARNING', code: 'UNKNOWN_REGION', message: `${officeType} region "${key}" is not a race on the ${cycle} ballot` });
      continue;
    }
    const sourceContestId = text(region.election_id);
    if (!sourceContestId) {
      issues.push({ severity: 'ERROR', code: 'NO_ELECTION_ID', message: `${raceLabel(race)} has no election_id` });
      continue;
    }
    if (seen.has(sourceContestId)) continue;
    seen.add(sourceContestId);
    const parsed = parseRace(region, race, sourceContestId, { lastUpdated, calledAt: null, counties: null }, issues);
    if (parsed) races.push(parsed);
  }
  return { kind: 'aggregate', testData: flag(root?.test_data), lastUpdated, races, issues };
}

/** `/race/{id}` for one race we already know (from the aggregate). */
export function parseDetailResults(body: unknown, race: Race, sourceContestId: string): ParsedDocument {
  const issues: ResultsParseIssue[] = [];
  const root = record(body) ?? {};
  const lastUpdated = isoTime(root.last_updated);
  if (!lastUpdated) issues.push({ severity: 'WARNING', code: 'NO_LAST_UPDATED', message: `${raceLabel(race)} detail has no last_updated; fetch time used` });
  const parsed = parseRace(root, race, sourceContestId, {
    lastUpdated,
    calledAt: isoTime(root.called_at),
    counties: root.region_results ?? {},
  }, issues);
  return { kind: 'detail', testData: flag(root.test_data), lastUpdated, races: parsed ? [parsed] : [], issues };
}

/** The candidates civicAPI has called, with whether they won outright or advance to a runoff. */
export function calledCandidates(update: RaceUpdate): Array<{ sourceCandidateId: string; kind: 'WINNER' | 'ADVANCED' }> {
  return update.candidates.flatMap((candidate) => [
    ...(candidate.winner ? [{ sourceCandidateId: candidate.sourceCandidateId, kind: 'WINNER' as const }] : []),
    ...(candidate.advanced && !candidate.winner ? [{ sourceCandidateId: candidate.sourceCandidateId, kind: 'ADVANCED' as const }] : []),
  ]);
}

/** Every number a snapshot stores, so an unchanged race writes nothing (aggregate times move on every poll). */
export function raceSignature(update: RaceUpdate): string {
  const tallies = (candidates: CandidateTally[]) => candidates.map((candidate) => `${candidate.sourceCandidateId}=${candidate.votes}/${candidate.percent ?? ''}`).sort().join(',');
  const counties = update.counties?.map((county) => `${county.fips}:${county.percentReporting ?? ''}:${county.otherVotes}:${tallies(county.candidates)}`).join(';') ?? '-';
  return [update.percentReporting ?? '', update.otherVotes, tallies(update.candidates), counties].join('|');
}

/** Vote total for a race or county: every candidate plus placeholder rows. */
export const totalVotes = (unit: { candidates: CandidateTally[]; otherVotes: number }) =>
  unit.candidates.reduce((sum, candidate) => sum + candidate.votes, unit.otherVotes);
