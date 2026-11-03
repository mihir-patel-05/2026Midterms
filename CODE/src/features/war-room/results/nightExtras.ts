import { SENATE_TO_CONTROL, HOUSE_TO_CONTROL, VICE_PRESIDENT } from "@/features/simulator/midterms/races2026";
import { leaderOf, type ChamberCount, type LiveBoard, type LiveCandidate, type LiveRace } from "./liveResults";

/**
 * Election-night extras on top of the live results, all pure: majority rules (runoffs and ranked-choice voting),
 * independents' caucus plans, chamber control, and calls that disappear from the feed. Each is behind a War Room
 * flag (see ../flags.ts).
 */

export interface MajorityRule {
  kind: "runoff" | "rcv";
  /** A few words for a table cell. */
  short: string;
  /** One sentence for the dossier. */
  text: string;
}

/**
 * States whose November 3 races for Congress need a majority. Georgia holds a runoff when no one passes 50%; Maine
 * and Alaska retabulate ranked choices. Louisiana is left out on purpose: its 2026 congressional races moved to party
 * primaries, so confirm its November rule before adding it here.
 */
export const MAJORITY_RULES: Record<string, MajorityRule> = {
  GA: { kind: "runoff", short: "Runoff if under 50%", text: "Georgia requires a majority: if no candidate passes 50%, the top two meet in a runoff." },
  ME: { kind: "rcv", short: "Ranked choice if under 50%", text: "Maine uses ranked-choice voting: if no candidate passes 50% of first choices, ballots are retabulated, and the leader can change." },
  AK: { kind: "rcv", short: "Ranked choice if under 50%", text: "Alaska uses ranked-choice voting: if no candidate passes 50% of first choices, ballots are retabulated, and the leader can change." },
};

export const majorityRuleFor = (code: string): MajorityRule | null => MAJORITY_RULES[code.slice(0, 2)] ?? null;

export type MajorityStatus =
  /** The source has called a runoff (candidates advanced). */
  | { kind: "runoff-called"; rule: MajorityRule | null }
  /** Uncalled, with the leader under 50% in a majority state. */
  | { kind: "under-majority"; rule: MajorityRule; leader: LiveCandidate };

/** What to say about a race's majority rule right now, or null when nothing applies (called, no votes, over 50%). */
export function majorityStatus(race: LiveRace | undefined): MajorityStatus | null {
  if (!race || race.winner) return null;
  const rule = majorityRuleFor(race.code);
  if (race.calls.some((call) => call.kind === "ADVANCED")) return { kind: "runoff-called", rule };
  const leader = leaderOf(race);
  if (!rule || !leader || leader.pct >= 50) return null;
  return { kind: "under-majority", rule, leader };
}

/** Independents on the 2026 ballot whose caucus matters to control, by race code. Their own public statements. */
export const INDEPENDENT_CAUCUS: Record<string, { name: string; note: string }> = {
  "NE-SEN": {
    name: "Dan Osborn",
    note: "Dan Osborn (independent, Nebraska) has said he would not caucus with either party, so a seat he wins counts as Other here, not toward either side's majority.",
  },
};

export interface ControlCall {
  chamber: "Senate" | "House";
  party: "D" | "R";
  seats: number;
  /** True when the Senate majority rests on the vice president's tiebreak. */
  tiebreak: boolean;
}

/**
 * Chambers whose control is settled by called seats alone. The Senate needs 51, or 50 for the vice president's party
 * (a 50–50 Senate is organized by that party); the House needs 218. Leads never count. Independents who have not
 * said whom they would caucus with count for neither side.
 */
export function controlDecided(senate: ChamberCount, house: ChamberCount): ControlCall[] {
  const decided: ControlCall[] = [];
  for (const party of ["D", "R"] as const) {
    const seats = senate.called[party];
    const tiebreak = party === VICE_PRESIDENT.party && seats === SENATE_TO_CONTROL - 1;
    if (seats >= SENATE_TO_CONTROL || tiebreak) decided.push({ chamber: "Senate", party, seats, tiebreak });
  }
  for (const party of ["D", "R"] as const) {
    if (house.called[party] >= HOUSE_TO_CONTROL) decided.push({ chamber: "House", party, seats: house.called[party], tiebreak: false });
  }
  return decided;
}

/* ---------- Calls seen in this browser: retractions and new calls ---------- */

export interface SeenCall {
  key: string;
  code: string;
  candidateId: string;
  name: string;
  party: string | null;
  partyName: string | null;
  calledBy: string;
  calledAt: string;
  isTestData: boolean;
}

export interface Retraction extends SeenCall {
  /** When this browser first saw the call missing (epoch ms). */
  noticedAt: number;
}

export interface CallTrackerState {
  /** Whether the board this state was built from was test data; a switch either way starts over. */
  testData: boolean;
  calls: Map<string, SeenCall>;
  /** Newest first, at most RETRACTIONS_KEPT. */
  retractions: Retraction[];
  /** Calls first seen in the latest board (none for the first board, so loading the page alerts nothing). */
  fresh: SeenCall[];
}

export const RETRACTIONS_KEPT = 50;

function winnerCalls(board: LiveBoard): Map<string, SeenCall> {
  const calls = new Map<string, SeenCall>();
  for (const race of board.races.values()) {
    for (const call of race.calls) {
      if (call.kind !== "WINNER") continue;
      const candidate = race.candidates.find((item) => item.id === call.candidateId);
      const key = `${race.code}|${call.candidateId}`;
      calls.set(key, {
        key, code: race.code, candidateId: call.candidateId, name: candidate?.name ?? "a candidate", party: candidate?.party ?? null,
        partyName: candidate?.partyName ?? null, calledBy: call.calledBy, calledAt: call.calledAt, isTestData: race.isTestData,
      });
    }
  }
  return calls;
}

/**
 * Folds the latest board into what this browser has seen. A winner call that was there before and is gone now, while
 * its race is still on the board, is a retraction. A race missing from the board entirely retracts nothing (the
 * source may have held it back), and its calls are remembered until it comes back.
 */
export function advanceCalls(prev: CallTrackerState | null, board: LiveBoard, now: number): CallTrackerState {
  const current = winnerCalls(board);
  if (!prev || prev.testData !== board.isTestData) return { testData: board.isTestData, calls: current, retractions: [], fresh: [] };
  const retractions = [...prev.retractions];
  const calls = new Map(current);
  for (const [key, call] of prev.calls) {
    if (current.has(key)) continue;
    if (!board.races.has(call.code)) {
      calls.set(key, call);
      continue;
    }
    retractions.unshift({ ...call, noticedAt: now });
  }
  const fresh = [...current.values()].filter((call) => !prev.calls.has(call.key));
  return { testData: board.isTestData, calls, retractions: retractions.slice(0, RETRACTIONS_KEPT), fresh };
}
