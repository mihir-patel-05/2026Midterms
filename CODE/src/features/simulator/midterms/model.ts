import { decisiveRace, MARGIN_BREAKS, raceResult, type HouseYear, type PresidentYear } from "@/features/election-monitor/pastResults";
import { ELECTORAL_VOTES } from "../electoralVotes";
import { callState, rollUpState, simBins, type Outcome, type Scenario, type Side, type StateOutcome } from "../model";
import { HOUSE_DISTRICT_CODES, SENATE_NOT_UP, SENATE_RACES_2026, SENATE_TO_CONTROL, VICE_PRESIDENT } from "./races2026";

/** The Senate side of a midterm scenario: the presidential one without Maine's and Nebraska's districts. */
export type SenateScenario = Omit<Scenario, "districts">;
export const EMPTY_SENATE: SenateScenario = { base: 2024, swing: 0, stateSwing: {}, counties: {}, picks: {} };

export interface SenateResult {
  /** Race states only; `ev` is the one seat at stake. */
  states: Record<string, StateOutcome>;
  /** County FIPS → simulated margin, in race states only. */
  counties: Map<string, number>;
  /** Whole chamber: seats not up plus the races. */
  totals: Record<Outcome, number>;
  /** The 35 races alone. */
  races: Record<Outcome, number>;
}

/**
 * The 2026 Senate races on a presidential baseline. There are no county Senate returns, so each
 * race state's counties start from the baseline presidential vote and add up exactly as in the
 * electoral college simulator; a pick replaces the result.
 */
export function simulateSenate(scenario: SenateScenario, data: PresidentYear | null): SenateResult {
  const states: Record<string, StateOutcome> = {};
  const counties = new Map<string, number>();
  const races: Record<Outcome, number> = { D: 0, R: 0, T: 0 };
  for (const code of Object.keys(SENATE_RACES_2026)) {
    const { margin, baseMargin, edited } = rollUpState(code, scenario, data, counties);
    const { winner, rating, source } = callState(margin, edited, scenario.picks[code]);
    states[code] = { code, ev: 1, margin, baseMargin, winner, rating, source, editedCounties: edited };
    races[winner] += 1;
  }
  const totals = { D: SENATE_NOT_UP.D + races.D, R: SENATE_NOT_UP.R + races.R, T: races.T };
  return { states, counties, totals, races };
}

/** Who controls the Senate with these seats: 51, or 50 plus the vice president's tiebreak. */
export function senateControl(totals: Record<Outcome, number>): Side | null {
  if (totals.D >= SENATE_TO_CONTROL) return "D";
  if (totals.R >= SENATE_TO_CONTROL) return "R";
  if (totals.T === 0 && totals[VICE_PRESIDENT.party] === SENATE_TO_CONTROL - 1) return VICE_PRESIDENT.party;
  return null;
}

/** Map colours for the Senate: race states as in the electoral college simulator, every other state "no race". */
export function senateBins(result: SenateResult, layer: "states" | "counties") {
  const bins = simBins({ states: result.states, counties: result.counties, districts: {}, totals: result.totals }, layer);
  if (layer === "states") for (const code of Object.keys(ELECTORAL_VOTES)) if (!bins.has(code)) bins.set(code, "no_race");
  return bins;
}

// ---------------------------------------------------------------------------
// House
// ---------------------------------------------------------------------------

export interface SeatOutcome {
  code: string;
  winner: Outcome;
  /** Party that won the seat in the baseline year; null on a blank map. */
  baseWinner: Outcome | null;
  /** Baseline margin in points, positive for Democrats; null when unopposed or blank. */
  baseMargin: number | null;
  /** True when the baseline winner ran unopposed. */
  unopposed: boolean;
  source: "pick" | "baseline" | "tossup";
}

export interface HouseResult {
  districts: Record<string, SeatOutcome>;
  totals: Record<Outcome, number>;
}

/** The 2024 result in each district: winner, signed margin, and whether anyone ran against them. */
export function houseBaseline(data: HouseYear) {
  const seats = new Map<string, { winner: Outcome; margin: number | null; unopposed: boolean }>();
  for (const code of HOUSE_DISTRICT_CODES) {
    const result = raceResult(decisiveRace(data.districts[code]));
    const party = result.winner?.party;
    if (!party) continue;
    const winner: Outcome = party === "O" ? "T" : party;
    const margin = result.status === "ok" && winner !== "T" ? (winner === "D" ? 1 : -1) * result.margin! : null;
    seats.set(code, { winner, margin, unopposed: result.status === "unopposed" });
  }
  return seats;
}

/**
 * Every House seat: the user's pick, or the baseline winner, or a tossup on a blank map. `data` is
 * the baseline year's House returns, or null for a blank map.
 */
export function simulateHouse(picks: Record<string, Outcome>, data: HouseYear | null): HouseResult {
  const baseline = data ? houseBaseline(data) : null;
  const districts: Record<string, SeatOutcome> = {};
  const totals: Record<Outcome, number> = { D: 0, R: 0, T: 0 };
  for (const code of HOUSE_DISTRICT_CODES) {
    const base = baseline?.get(code);
    const pick = picks[code];
    const winner: Outcome = pick ?? base?.winner ?? "T";
    districts[code] = {
      code,
      winner,
      baseWinner: base?.winner ?? null,
      baseMargin: base?.margin ?? null,
      unopposed: base?.unopposed ?? false,
      source: pick ? "pick" : base ? "baseline" : "tossup",
    };
    totals[winner] += 1;
  }
  return { districts, totals };
}

/**
 * What a click on a district does next. A decided seat flips to the other party, then goes back to
 * its baseline (null). A seat with no baseline goes D, R, then back.
 */
export function nextSeatPick(current: Outcome | undefined, computed: Outcome | null): Outcome | null {
  if (computed === null || computed === "T") return current === undefined ? "D" : current === "D" ? "R" : null;
  return current === undefined ? (computed === "D" ? "R" : "D") : null;
}

const binIndex = (margin: number) => MARGIN_BREAKS.filter((limit) => Math.abs(margin) >= limit).length;

/** Baseline seats shaded by their margin (unopposed gets the widest-margin shade), picks at the "likely" shade, tossups gold. */
export function houseBins(result: HouseResult) {
  const bins = new Map<string, string>();
  for (const seat of Object.values(result.districts)) {
    if (seat.winner === "T") bins.set(seat.code, "tossup");
    else if (seat.source === "pick") bins.set(seat.code, `${seat.winner}2`);
    else bins.set(seat.code, `${seat.winner}${seat.baseMargin === null ? 4 : binIndex(seat.baseMargin)}`);
  }
  return bins;
}
