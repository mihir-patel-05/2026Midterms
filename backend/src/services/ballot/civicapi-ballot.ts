/**
 * General election candidates for every House and Senate race, from civicAPI's two 2026
 * aggregates (docs/plans/civicapi-results.md). civicAPI compiles them from secretaries of
 * state, so unlike FEC filings they include candidates who never registered with the FEC and
 * leave out primary losers. Parsing is pure and tolerant: an unexpected shape becomes an
 * issue in the report, never a crash.
 */
import { nameParts } from '../../utils/person-name.js';
import { ballotRaces, raceKey, type Race } from '../../utils/races.js';

export interface BallotCandidate {
  /** civicAPI's id, or `name:<normalized name>|<party code>` when it has none. */
  sourceCandidateId: string;
  name: string;
  /** The party as civicAPI names it ("Democratic"), or null. */
  party: string | null;
  /** D, R, L, G, I, or O for other parties. */
  partyCode: string;
  isIncumbent: boolean;
  /** A declared write-in: civicAPI lists them, but they are not printed on the ballot. */
  writeIn: boolean;
}

export interface BallotRace extends Race {
  /** `CA-07`, `DE-00`, `GA-SEN`. */
  label: string;
  /** civicAPI's region key (`ca-07`, `ga`). */
  regionKey: string;
  sourceContestId: string;
  name: string;
  special: boolean;
  candidates: BallotCandidate[];
}

export interface ParsedAggregate {
  races: BallotRace[];
  issues: string[];
}

const WRITE_IN = /write[- ]?in/i;
// Placeholder rows some states report alongside the real candidates.
const NOT_A_CANDIDATE = /^(write[- ]?ins?|other|others|scattering|none of these candidates|blank|over ?votes?|under ?votes?)$/i;

export function partyCode(party: string | null): string {
  const value = party?.trim().toLowerCase() ?? '';
  if (!value) return 'O';
  if (value === 'd' || value === 'dem' || value.startsWith('democrat')) return 'D';
  if (value === 'r' || value === 'rep' || value.startsWith('republican')) return 'R';
  if (value.startsWith('libertarian')) return 'L';
  if (value.startsWith('green')) return 'G';
  if (/^(i|ind|independent|no party|nonpartisan|unaffiliated)/.test(value)) return 'I';
  return 'O';
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const normalized = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** `pa-07` → PA-07, `ak-al` → AK-00, `pa` → PA-SEN; null for a key that is no race on the ballot. */
export function raceFromRegion(regionKey: string, officeType: Race['officeType'], cycle: number): Race | null {
  const key = regionKey.trim().toLowerCase();
  const match = officeType === 'SENATE' ? /^([a-z]{2})(?:-s(?:pecial)?)?$/.exec(key) : /^([a-z]{2})-(\d{1,2}|al)$/.exec(key);
  if (!match) return null;
  const state = match[1].toUpperCase();
  const races = ballotRaces(cycle) ?? [];
  if (officeType === 'SENATE') return races.find((race) => race.officeType === 'SENATE' && race.state === state) ?? null;
  const seats = races.filter((race) => race.officeType === 'HOUSE' && race.state === state);
  const district = match[2] === 'al' ? '00' : match[2].padStart(2, '0');
  // At-large seats are "00" here; accept "-al", "-00", or "-01" for them.
  if (seats.length === 1) return seats[0].district === '00' && ['00', '01'].includes(district) ? seats[0] : null;
  return seats.find((race) => race.district === district) ?? null;
}

function parseCandidates(value: unknown, label: string, issues: string[]): BallotCandidate[] {
  if (!Array.isArray(value)) {
    issues.push(`${label}: no candidate list`);
    return [];
  }
  const candidates: BallotCandidate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = record(item);
    const name = text(row?.name);
    if (!row || !name) {
      issues.push(`${label}: a candidate has no name`);
      continue;
    }
    if (NOT_A_CANDIDATE.test(name)) continue;
    const listed = text(row.party) || null;
    // civicAPI gives declared write-ins the party "Write-In"; that is no party.
    const writeIn = WRITE_IN.test(listed ?? '');
    const party = writeIn ? null : listed;
    const code = partyCode(party);
    const sourceCandidateId = text(row.candidate_id) || `name:${normalized(name)}|${code}`;
    if (seen.has(sourceCandidateId)) continue;
    seen.add(sourceCandidateId);
    candidates.push({ sourceCandidateId, name, party, partyCode: code, isIncumbent: row.incumbent === true || row.incumbent === 'true', writeIn });
  }
  // Two names that could be one person ("Dan Sullivan", "Daniel J. Jr. Sullivan"). Both are kept:
  // they can be two real candidates, so the source has to settle it.
  const onBallot = candidates.filter((candidate) => !candidate.writeIn);
  for (const [index, candidate] of onBallot.entries()) {
    const parts = nameParts(candidate.name);
    const twin = onBallot.slice(index + 1).find((other) => {
      const otherParts = nameParts(other.name);
      return parts && otherParts && parts.last === otherParts.last && parts.first[0] === otherParts.first[0] && candidate.partyCode === other.partyCode;
    });
    if (twin) issues.push(`${label}: "${candidate.name}" and "${twin.name}" may be the same person; both kept`);
  }
  return candidates;
}

/**
 * One aggregate (`GET /race/{id}`). Its `region_results` holds one region per race, keyed
 * `pa-07` / `ak-al` for the House and `pa` for the Senate. An array of regions that carry
 * their own `key` is read too.
 */
export function parseAggregate(body: unknown, officeType: Race['officeType'], cycle: number): ParsedAggregate {
  const issues: string[] = [];
  const root = record(body);
  const regions = root?.region_results ?? record(root?.race)?.region_results;
  const entries: Array<[string, unknown]> = Array.isArray(regions)
    ? regions.map((region) => [text(record(region)?.key ?? record(region)?.region ?? record(region)?.code), region])
    : Object.entries(record(regions) ?? {});
  if (entries.length === 0) issues.push(`${officeType} aggregate has no region_results`);

  const races = new Map<string, BallotRace>();
  for (const [regionKey, value] of entries) {
    const region = record(value);
    const race = raceFromRegion(regionKey, officeType, cycle);
    if (!race || !region) {
      issues.push(`${officeType} region "${regionKey}" is not a race on the ${cycle} ballot`);
      continue;
    }
    const label = race.officeType === 'SENATE' ? `${race.state}-SEN` : `${race.state}-${race.district}`;
    if (races.has(raceKey(race))) {
      issues.push(`${label}: listed twice; kept the first`);
      continue;
    }
    const name = text(region.name);
    races.set(raceKey(race), {
      ...race,
      label,
      regionKey,
      sourceContestId: text(region.election_id) || `${officeType.toLowerCase()}:${regionKey}`,
      name: name || label,
      special: /special/i.test(name),
      candidates: parseCandidates(region.candidates, label, issues),
    });
  }
  return { races: [...races.values()], issues };
}
