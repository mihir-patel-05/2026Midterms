import { ODDS_COLORS, ODDS_STATUS_COLORS } from "@/features/election-monitor/oddsMap";
import { HOUSE_DISTRICT_CODES, SENATE_RACE_CODES } from "@/features/simulator/midterms/races2026";
import { raceState, STATE_NAMES } from "../raceCodes";
import type {
  CandidateContract,
  DashboardBootstrapResponse,
  ElectionResultsResponseContract,
  FinalStatusContract,
  FinalStatusKind,
  RaceCallContract,
  ResponseMetadataContract,
  SourceStatusContract,
} from "@/features/election-dashboard/types";

/**
 * Live results from /api/v1 (civicAPI on election night), indexed by War Room race code: `PA-07`, `GA-SEN`.
 * Everything here is pure, so the board, the map lens and the dossier agree on one reading. Numbers are the
 * source's; nothing is filled in. The top candidate is "leading" until the source's decision desk calls the race.
 */

export interface LiveCandidate {
  id: string;
  candidacyId: string;
  name: string;
  /** D, R, or another code (L, G, I, O); null with no party. */
  party: string | null;
  partyName: string | null;
  votes: number;
  /** Share of the vote, 0–100. */
  pct: number;
  isIncumbent: boolean;
  isWriteIn: boolean;
  fecId: string | null;
  call: RaceCallContract["kind"] | null;
}

export interface LiveRace {
  code: string;
  contestId: string;
  office: "US_SENATE" | "US_HOUSE";
  title: string;
  /** Sorted by votes, most first; candidates with no votes yet keep ballot order. */
  candidates: LiveCandidate[];
  totalVotes: number;
  /** The source's estimate of the share of the expected vote counted, or a counted share; null when unknown. */
  pctCounted: number | null;
  /** "estimate" when the source gives a share with no counts behind it (civicAPI). */
  pctKind: "estimate" | "counted" | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "DELAYED" | "UNAVAILABLE";
  updatedAt: string;
  calls: RaceCallContract[];
  winner: LiveCandidate | null;
  /** Leader's share minus the runner-up's, in points; null before votes. */
  marginPts: number | null;
  isTestData: boolean;
  /** After election night: still counting, no change since a date, certified, and so on (#136). */
  finalStatus: FinalStatusContract | null;
  meta: ResponseMetadataContract;
}

export interface LiveBoard {
  races: Map<string, LiveRace>;
  /** Contests the source lists with no result yet (held back, withheld, or not started). */
  waiting: number;
  source: SourceStatusContract;
  attribution: string;
  freshness: ResponseMetadataContract["freshness"];
  updatedAt: string;
  isTestData: boolean;
  isMock: boolean;
}

/** "D", "R", or the source's other code. Ballot-sync parties carry their code as the abbreviation. */
export function partyCode(party: CandidateContract["party"]): string | null {
  if (!party) return null;
  const abbreviation = party.abbreviation?.toUpperCase();
  if (abbreviation) return abbreviation === "DEM" ? "D" : abbreviation === "REP" ? "R" : abbreviation;
  const name = party.name.toLowerCase();
  return name.startsWith("democrat") ? "D" : name.startsWith("republican") ? "R" : "O";
}

/** `PA-07`, `GA-SEN`, or null for a contest the War Room has no code for. */
export function raceCodeOf(contest: { officeType: string; jurisdiction: { stateCode?: string }; districtCode?: string }): string | null {
  const state = contest.jurisdiction.stateCode;
  if (!state) return null;
  if (contest.officeType === "US_SENATE") return `${state}-SEN`;
  if (contest.officeType === "US_HOUSE" && contest.districtCode) return `${state}-${contest.districtCode.padStart(2, "0")}`;
  return null;
}

export function toLiveRace(item: ElectionResultsResponseContract): LiveRace | null {
  const data = item.data;
  if (!data) return null;
  const code = raceCodeOf(data.contest);
  if (!code || (data.contest.officeType !== "US_SENATE" && data.contest.officeType !== "US_HOUSE")) return null;
  const results = new Map(data.candidateResults.map((result) => [result.candidateId, result]));
  const calls = data.calls ?? [];
  const callFor = new Map(calls.map((call) => [call.candidateId, call.kind]));
  const order = new Map(data.candidates.map((candidate, index) => [candidate.id, candidate.ballotOrder ?? index + 1]));
  const candidates: LiveCandidate[] = data.candidates.map((candidate) => {
    const result = results.get(candidate.id);
    return {
      id: candidate.id,
      candidacyId: candidate.candidacyId,
      name: candidate.displayName,
      party: partyCode(candidate.party),
      partyName: candidate.party?.name ?? null,
      votes: result?.votes ?? 0,
      pct: result?.percentage ?? 0,
      isIncumbent: candidate.isIncumbent ?? false,
      isWriteIn: candidate.isWriteIn,
      fecId: candidate.fecCandidateId ?? null,
      call: callFor.get(candidate.id) ?? null,
    };
  });
  // Declared write-ins with no votes stay off the board.
  const listed = candidates.filter((candidate) => !candidate.isWriteIn || candidate.votes > 0);
  listed.sort((a, b) => b.votes - a.votes || (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const progress = data.reportingProgress;
  const estimate = progress.estimatedPercentage ?? null;
  const counted = progress.precincts.percentage ?? progress.reportingUnits.percentage ?? null;
  const [first, second] = listed;
  return {
    code,
    contestId: data.contest.id,
    office: data.contest.officeType,
    title: data.contest.officeTitle,
    candidates: listed,
    totalVotes: data.totalVotes,
    pctCounted: estimate ?? counted,
    pctKind: estimate !== null ? "estimate" : counted !== null ? "counted" : null,
    status: data.status,
    updatedAt: data.updatedAt,
    calls,
    winner: listed.find((candidate) => candidate.call === "WINNER") ?? null,
    marginPts: first && first.votes > 0 ? first.pct - (second?.pct ?? 0) : null,
    isTestData: data.isTestData ?? false,
    finalStatus: data.finalStatus ?? null,
    meta: item.meta,
  };
}

/** One or two words for tables and chips. */
export const FINAL_STATUS_SHORT: Record<FinalStatusKind, string> = {
  COUNTING: "Counting",
  STABLE: "Unofficial",
  RECOUNT: "Recount",
  CONTESTED: "Contested",
  CERTIFIED: "Certified",
  UNOPPOSED: "Unopposed",
  RUNOFF: "Runoff",
  RANKED_CHOICE: "Ranked choice",
};

/** An unopposed race with no votes counted (Florida prints none): never shown as 0 votes or 0%. */
export function isUncountedUnopposed(race: LiveRace | undefined): boolean {
  return race?.finalStatus?.status === "UNOPPOSED" && race.totalVotes === 0;
}

export function indexBootstrap(payload: DashboardBootstrapResponse): LiveBoard {
  const races = new Map<string, LiveRace>();
  let waiting = 0;
  for (const item of payload.data.results) {
    const race = toLiveRace(item);
    if (race) races.set(race.code, race);
    else waiting++;
  }
  const meta = payload.meta;
  const attribution = [...races.values()][0]?.meta.mockDisclaimer ?? meta.mockDisclaimer ?? null;
  return {
    races,
    waiting,
    source: meta.source,
    attribution: attribution ?? `Results: ${meta.source.name} (${new URL(meta.source.url).hostname}). Unofficial until certified.`,
    freshness: meta.freshness,
    updatedAt: meta.updatedAt,
    isTestData: [...races.values()].some((race) => race.isTestData),
    isMock: meta.isMockData,
  };
}

/** The leader before a call, the winner after. Null before any votes. */
export function leaderOf(race: LiveRace | undefined): LiveCandidate | null {
  if (!race) return null;
  return race.winner ?? (race.candidates[0] && race.candidates[0].votes > 0 ? race.candidates[0] : null);
}

/** "About 64% of expected vote counted (civicAPI estimate)", or the counted share. */
export function progressLabel(race: LiveRace, short = false): string {
  // After election night the source's share-counted estimate is not served; the race's status says where it stands.
  if (race.finalStatus) return short ? FINAL_STATUS_SHORT[race.finalStatus.status] : race.finalStatus.label;
  if (race.pctCounted === null) return short ? "—" : "Share counted unknown";
  const pct = race.pctCounted >= 99.5 && race.pctCounted < 100 ? ">99" : Math.round(race.pctCounted).toString();
  if (short) return `${race.pctKind === "estimate" ? "~" : ""}${pct}%`;
  return race.pctKind === "estimate"
    ? `About ${pct}% of the expected vote counted (${race.meta.source.name} estimate)`
    : `${pct}% of precincts reporting`;
}

export interface ChamberCount {
  /** Seats called for each side, including Senate holdovers when given. */
  called: { D: number; R: number; other: number };
  /** Uncalled races where each side leads in the count. */
  leading: { D: number; R: number; other: number };
  uncalled: number;
  /** Races with no votes counted yet, or no result from the source. */
  noVotes: number;
}

const side = (party: string | null) => (party === "D" ? "D" : party === "R" ? "R" : "other") as "D" | "R" | "other";

/**
 * Called and leading seats in one chamber. `codes` is every race on the ballot; races the source has not
 * reported count as no votes, never as anyone's.
 */
export function chamberCount(board: LiveBoard | null, codes: readonly string[], holdovers: { D: number; R: number } = { D: 0, R: 0 }): ChamberCount {
  const count: ChamberCount = { called: { D: holdovers.D, R: holdovers.R, other: 0 }, leading: { D: 0, R: 0, other: 0 }, uncalled: 0, noVotes: 0 };
  for (const code of codes) {
    const race = board?.races.get(code);
    if (race?.winner) {
      count.called[side(race.winner.party)]++;
      continue;
    }
    count.uncalled++;
    const leader = leaderOf(race);
    if (leader) count.leading[side(leader.party)]++;
    else count.noVotes++;
  }
  return count;
}

export interface CallEntry {
  code: string;
  at: string;
  /** False when the source gave no call time and this is when it was first seen. */
  sourceTime: boolean;
  kind: RaceCallContract["kind"];
  candidate: LiveCandidate;
  calledBy: string;
  isTestData: boolean;
}

/** Every current call, newest first. */
export function callFeed(board: LiveBoard | null): CallEntry[] {
  if (!board) return [];
  const entries: CallEntry[] = [];
  for (const race of board.races.values()) {
    for (const call of race.calls) {
      const candidate = race.candidates.find((item) => item.id === call.candidateId);
      if (candidate) entries.push({ code: race.code, at: call.calledAt, sourceTime: call.calledAtIsSourceTime, kind: call.kind, candidate, calledBy: call.calledBy, isTestData: race.isTestData });
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.code.localeCompare(b.code));
}

/** Map bins for the Results lens: called (`D-call`), leading by margin (`D2` 10+ pts, `D1` 3–10, `D0` under 3), or no votes. */
export type ResultsBin = `${"D" | "R" | "O"}${"-call" | "2" | "1" | "0"}` | "no_votes" | "no_result";

export function resultsBin(race: LiveRace | undefined): ResultsBin {
  if (!race) return "no_result";
  const leader = leaderOf(race);
  if (!leader) return "no_votes";
  const letter = leader.party === "D" ? "D" : leader.party === "R" ? "R" : "O";
  if (race.winner) return `${letter}-call`;
  const margin = race.marginPts ?? 0;
  return `${letter}${margin >= 10 ? "2" : margin >= 3 ? "1" : "0"}`;
}

/** Bins keyed by map feature: state codes for the Senate, `PA-07` for the House. */
export function resultsBins(board: LiveBoard | null, office: "senate" | "house", codes: readonly string[]): Map<string, ResultsBin> {
  const bins = new Map<string, ResultsBin>();
  for (const code of codes) bins.set(office === "senate" ? code.slice(0, 2) : code, resultsBin(board?.races.get(code)));
  return bins;
}

/**
 * Races whose leader (or winner) is of a different party than the seat's holder today, keyed like the bins.
 * `holderOf` returns the holder's party letter, or null when unknown (never hatched then).
 */
export function resultsFlips(board: LiveBoard | null, office: "senate" | "house", codes: readonly string[], holderOf: (code: string) => string | null): Set<string> {
  const flips = new Set<string>();
  for (const code of codes) {
    const leader = leaderOf(board?.races.get(code));
    const holder = holderOf(code);
    if (!leader || !holder) continue;
    const letter = leader.party === "D" || leader.party === "R" ? leader.party : "I";
    if (letter !== holder) flips.add(office === "senate" ? code.slice(0, 2) : code);
  }
  return flips;
}

/** The odds map's ramps, deepest for a call, so the two maps read alike. */
export const RESULTS_COLORS: Record<ResultsBin, string> = {
  ...(Object.fromEntries((["D", "R", "O"] as const).flatMap((party) => [
    [`${party}-call`, ODDS_COLORS[`${party}3`]], [`${party}2`, ODDS_COLORS[`${party}2`]], [`${party}1`, ODDS_COLORS[`${party}1`]], [`${party}0`, ODDS_COLORS[`${party}0`]],
  ])) as Record<Exclude<ResultsBin, "no_votes" | "no_result">, string>),
  no_votes: ODDS_STATUS_COLORS.no_price,
  no_result: ODDS_STATUS_COLORS.no_market,
};

/** Every 2026 race code, by chamber. */
export const SENATE_CODES = SENATE_RACE_CODES.map((state) => `${state}-SEN`);
export const HOUSE_CODES = HOUSE_DISTRICT_CODES;

/** The states of some races, for the official-links shortcut. */
export const statesOf = (codes: string[]) => [...new Set(codes.map(raceState))].filter((state) => STATE_NAMES[state]).sort();
