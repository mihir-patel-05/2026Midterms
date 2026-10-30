/**
 * Matches a parsed poll to one 2026 Senate or House race by its candidates.
 *
 * VoteHub names candidates but not the race, and doesn't mark primaries. A poll
 * is published only when it is unambiguous:
 * - at least two of its answers are FEC candidates in the same race, and no
 *   other race matches as many;
 * - those candidates come from at least two parties (one-party polls are
 *   almost always primaries).
 * Anything else is kept with a review reason, and never shown until an admin
 * accepts it. A state or district the record names only breaks ties.
 */
import { houseDistrict } from '../election.service.js';
import { normalizeParty, type ParsedPoll, type PollOfficeCode } from './votehub-client.js';

export interface RaceCandidate {
  fecId: string;
  /** FEC style, "LAST, FIRST MIDDLE". */
  name: string;
  party: string | null;
  office: PollOfficeCode;
  state: string;
  /** Two digits for the House ("00" at-large); null for the Senate. */
  district: string | null;
}

export type ReviewReason = 'no_race_match' | 'ambiguous_race' | 'likely_primary';

export interface MatchedAnswer {
  choice: string;
  pct: number;
  party: string | null;
  candidateFecId: string | null;
}

export interface RaceMatch {
  raceCode: string | null;
  office: PollOfficeCode;
  state: string | null;
  district: string | null;
  status: 'PUBLISHED' | 'NEEDS_REVIEW';
  reviewReason: ReviewReason | null;
  answers: MatchedAnswer[];
}

const OTHER_ANSWER = /^(undecided|other|others|someone else|somebody else|not sure|unsure|don'?t know|do not know|refused|no answer|no opinion|neither|none|wouldn'?t vote|would not vote|will not vote|third[- ]party|another candidate|skipped)\b/i;
const SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

/** "Undecided", "Other", "Someone else": answers that are not a candidate. */
export function isOtherAnswer(choice: string): boolean {
  return OTHER_ANSWER.test(choice.trim());
}

/** Upper-case words without accents, punctuation, or name suffixes. */
function words(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z\s'-]/g, ' ')
    .replace(/['-]/g, (char) => (char === '-' ? ' ' : ''))
    .split(/\s+/)
    .filter((word) => word && !SUFFIXES.has(word));
}

/** "CASEY, ROBERT P. JR." → { last: ["CASEY"], first: "ROBERT" }. Names without a comma take the last word. */
function fecNameParts(name: string): { last: string[]; first: string | null } {
  const [lastPart, rest] = name.split(',', 2);
  if (rest !== undefined) return { last: words(lastPart), first: words(rest)[0] ?? null };
  const all = words(name);
  return { last: all.slice(-1), first: all.length > 1 ? all[0] : null };
}

/** Party written in a choice, such as "Brown (D)". */
function partyInChoice(choice: string): string | null {
  const match = /\(([A-Za-z]{1,12})\)/.exec(choice);
  return match ? normalizeParty(match[1]) : null;
}

/**
 * The race's candidates this choice names. The choice must end with the
 * candidate's last name ("Sherrod Brown", "Brown", "De La Cruz"); when two
 * candidates share it, a first name or initial in the choice picks one.
 */
function candidatesFor(choice: string, candidates: RaceCandidate[]): RaceCandidate[] {
  const choiceWords = words(choice);
  if (choiceWords.length === 0) return [];
  const byLast = candidates.filter((candidate) => {
    const { last } = fecNameParts(candidate.name);
    if (last.length === 0 || last.length > choiceWords.length) return false;
    return last.every((word, index) => choiceWords[choiceWords.length - last.length + index] === word);
  });
  if (byLast.length <= 1 || choiceWords.length < 2) return byLast;
  const first = choiceWords[0];
  const byFirst = byLast.filter((candidate) => {
    const candidateFirst = fecNameParts(candidate.name).first;
    return candidateFirst && (candidateFirst === first || (first.length === 1 && candidateFirst.startsWith(first)));
  });
  return byFirst.length > 0 ? byFirst : byLast;
}

export function raceCode(office: PollOfficeCode, state: string, district: string | null): string {
  return office === 'SENATE' ? `${state}-SEN` : `${state}-${district}`;
}

/** Group candidates by race code, dropping House filings whose district doesn't exist. */
export function indexCandidates(candidates: RaceCandidate[]): Map<string, RaceCandidate[]> {
  const races = new Map<string, RaceCandidate[]>();
  for (const candidate of candidates) {
    const district = candidate.office === 'HOUSE' ? houseDistrict(candidate.state, candidate.district) : null;
    if (candidate.office === 'HOUSE' && !district) continue;
    const code = raceCode(candidate.office, candidate.state, district);
    races.set(code, [...(races.get(code) ?? []), { ...candidate, district }]);
  }
  return races;
}

interface Scored {
  code: string;
  candidates: RaceCandidate[];
  matches: Map<string, RaceCandidate>;
}

export function matchRace(poll: ParsedPoll, races: Map<string, RaceCandidate[]>): RaceMatch {
  const named = poll.answers.filter((answer) => !isOtherAnswer(answer.choice));
  const scored: Scored[] = [];
  for (const [code, candidates] of races) {
    if (candidates[0]?.office !== poll.office) continue;
    const matches = new Map<string, RaceCandidate>();
    for (const answer of named) {
      const found = candidatesFor(answer.choice, candidates);
      if (found.length === 1) matches.set(answer.choice, found[0]);
    }
    // Two different answers naming one candidate is not two matches.
    if (new Set([...matches.values()].map((candidate) => candidate.fecId)).size >= 2) scored.push({ code, candidates, matches });
  }

  const best = Math.max(0, ...scored.map((race) => race.matches.size));
  let top = scored.filter((race) => race.matches.size === best);
  if (top.length > 1 && poll.stateHint) {
    const hinted = top.filter((race) =>
      race.candidates[0].state === poll.stateHint && (!poll.districtHint || race.candidates[0].district === poll.districtHint));
    if (hinted.length > 0) top = hinted;
  }

  const unmatched = (reason: ReviewReason): RaceMatch => ({
    raceCode: null,
    office: poll.office,
    state: poll.stateHint,
    district: poll.districtHint,
    status: 'NEEDS_REVIEW',
    reviewReason: reason,
    answers: poll.answers.map((answer) => ({ ...answer, party: answer.party ?? partyInChoice(answer.choice), candidateFecId: null })),
  });
  if (top.length === 0) return unmatched('no_race_match');
  if (top.length > 1) return unmatched('ambiguous_race');

  const race = top[0];
  const answers = poll.answers.map((answer) => {
    const candidate = race.matches.get(answer.choice);
    return {
      choice: answer.choice,
      pct: answer.pct,
      party: normalizeParty(candidate?.party) ?? answer.party ?? partyInChoice(answer.choice),
      candidateFecId: candidate?.fecId ?? null,
    };
  });
  const parties = new Set(answers.filter((answer) => answer.candidateFecId && answer.party).map((answer) => answer.party));
  return {
    raceCode: race.code,
    office: poll.office,
    state: race.candidates[0].state,
    district: race.candidates[0].district,
    status: parties.size >= 2 ? 'PUBLISHED' : 'NEEDS_REVIEW',
    reviewReason: parties.size >= 2 ? null : 'likely_primary',
    answers,
  };
}
