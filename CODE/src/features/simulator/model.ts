import { stateFipsToPostal } from "@/features/election-monitor/map/fips";
import { MARGIN_BREAKS, type PresidentYear, type VoteTriple } from "@/features/election-monitor/pastResults";
import { DISTRICT_BASELINES, DISTRICT_CODES, districtState, ELECTORAL_VOTES, statewideVotes } from "./electoralVotes";

export type Side = "D" | "R";
export type Outcome = Side | "T";
export type Rating = "safe" | "likely" | "lean";
/** A state set by hand: a party with a rating, or a tossup. */
export type Pick = { party: Side; rating: Rating } | { party: "T" };

export interface Scenario {
  /** Baseline presidential election; null is a blank map where every state starts as a tossup. */
  base: number | null;
  /** Uniform swing in points of margin, positive toward Democrats, applied to every county. */
  swing: number;
  /** Extra swing for one state's counties, on top of `swing`. */
  stateSwing: Record<string, number>;
  /** County FIPS → margin set by hand, in points (D minus R, as a share of all votes). */
  counties: Record<string, number>;
  /** State code → pick; a pick replaces whatever the counties add up to. */
  picks: Record<string, Pick>;
  /** "ME-2" → winner set by hand. */
  districts: Record<string, Outcome>;
}

export const EMPTY_SCENARIO: Scenario = { base: 2024, swing: 0, stateSwing: {}, counties: {}, picks: {}, districts: {} };

export type StateSource = "pick" | "counties" | "baseline" | "tossup";

export interface StateOutcome {
  code: string;
  /** Votes decided statewide (Maine and Nebraska's district votes are counted separately). */
  ev: number;
  /** Simulated margin before any pick, or null on a blank map or with no data. */
  margin: number | null;
  /** The baseline election's actual margin. */
  baseMargin: number | null;
  winner: Outcome;
  rating: Rating | null;
  /** Where the result comes from: a pick, edited counties, the baseline plus swing, or a blank map. */
  source: StateSource;
  editedCounties: number;
}

export interface DistrictOutcome {
  code: string;
  winner: Outcome;
  source: "pick" | "baseline" | "state";
}

export interface SimulationResult {
  states: Record<string, StateOutcome>;
  districts: Record<string, DistrictOutcome>;
  /** County FIPS → simulated margin; empty on a blank map. */
  counties: Map<string, number>;
  totals: Record<Outcome, number>;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Margin in points of all votes cast, positive for Democrats. */
export function marginOf([d, r, o]: VoteTriple): number | null {
  const total = d + r + o;
  return total > 0 ? ((d - r) / total) * 100 : null;
}

/**
 * Re-splits the two-party vote so the margin (as a share of all votes) is `margin`. Turnout and the
 * third-party vote stay as they were; the margin is capped at what the two-party vote allows.
 */
export function withMargin([d, r, o]: VoteTriple, margin: number): VoteTriple {
  const total = d + r + o;
  const twoParty = d + r;
  if (total === 0) return [d, r, o];
  const lead = Math.max(-twoParty, Math.min(twoParty, (margin / 100) * total));
  return [(twoParty + lead) / 2, (twoParty - lead) / 2, o];
}

/** Rating for a margin in points: lean under 5, likely 5–10, safe 10 and up. */
export function ratingFor(margin: number): Rating {
  const size = Math.abs(margin);
  return size >= MARGIN_BREAKS[2] ? "safe" : size >= MARGIN_BREAKS[1] ? "likely" : "lean";
}

/** Decided by the exact margin: Florida 2000 was won by 537 votes, a 0.01-point margin. */
export function winnerOf(margin: number | null): Outcome {
  if (margin === null || margin === 0) return "T";
  return margin > 0 ? "D" : "R";
}

/** County FIPS codes grouped by state, built once per data file. */
const countyIndex = new WeakMap<PresidentYear, Map<string, string[]>>();
export function countiesByState(data: PresidentYear) {
  let index = countyIndex.get(data);
  if (!index) {
    index = new Map();
    for (const fips of Object.keys(data.counties)) {
      const state = stateFipsToPostal[fips.slice(0, 2)];
      if (!state) continue;
      index.set(state, [...(index.get(state) ?? []), fips]);
    }
    countyIndex.set(data, index);
  }
  return index;
}

/** The county edits and swings that `rollUpState` reads; the midterm Senate scenario has them too. */
export type CountyScenario = Omit<Scenario, "picks" | "districts">;

/**
 * One state's margin from its counties. Each county's margin is its hand-set value, or its baseline
 * margin plus the national and state swing; the state's margin is the sum of its counties' re-split
 * votes, so an edited county moves its state by its share of the state's turnout. Every county's
 * simulated margin is written to `countiesOut`.
 */
export function rollUpState(code: string, scenario: CountyScenario, data: PresidentYear | null, countiesOut: Map<string, number>) {
  const blank = scenario.base === null || !data;
  const stateVotes = data?.states[code]?.votes;
  const baseMargin = !blank && stateVotes ? marginOf(stateVotes) : null;
  let margin: number | null = null;
  let edited = 0;

  if (!blank && data && stateVotes) {
    const swing = scenario.swing + (scenario.stateSwing[code] ?? 0);
    let lead = 0;
    let total = 0;
    // Votes in the state total but in no county: overseas and federal-only ballots, ballots a
    // certified canvass added (Florida 2000), and all of Alaska. They swing like one more county.
    const rest: VoteTriple = [...stateVotes];
    for (const fips of countiesByState(data).get(code) ?? []) {
      const votes = data.counties[fips];
      rest[0] -= votes[0];
      rest[1] -= votes[1];
      rest[2] -= votes[2];
      const own = marginOf(votes);
      if (own === null) continue;
      const set = scenario.counties[fips];
      if (set !== undefined) edited++;
      const [d, r, o] = withMargin(votes, set ?? own + swing);
      countiesOut.set(fips, ((d - r) / (d + r + o)) * 100);
      lead += d - r;
      total += d + r + o;
    }
    const restMargin = marginOf(rest);
    const [d, r, o] = restMargin !== null && rest.every((n) => n >= 0) ? withMargin(rest, restMargin + swing) : rest;
    lead += d - r;
    total += d + r + o;
    margin = total > 0 ? (lead / total) * 100 : null;
  }
  return { margin, baseMargin, edited };
}

/** A state's call from its rolled-up margin, unless a pick replaces it. */
export function callState(margin: number | null, edited: number, pick: Pick | undefined) {
  const computed = winnerOf(margin);
  const winner: Outcome = pick ? pick.party : computed;
  const rating = pick ? (pick.party === "T" ? null : pick.rating) : computed === "T" ? null : ratingFor(margin!);
  const source: StateSource = pick ? "pick" : margin === null ? "tossup" : edited > 0 ? "counties" : "baseline";
  return { winner, rating, source };
}

/** Plays out a scenario on a baseline election; see `rollUpState` for how counties add up. */
export function simulate(scenario: Scenario, data: PresidentYear | null): SimulationResult {
  const states: Record<string, StateOutcome> = {};
  const counties = new Map<string, number>();
  const totals: Record<Outcome, number> = { D: 0, R: 0, T: 0 };
  const blank = scenario.base === null || !data;

  for (const code of Object.keys(ELECTORAL_VOTES)) {
    const ev = statewideVotes(code);
    const { margin, baseMargin, edited } = rollUpState(code, scenario, data, counties);
    const { winner, rating, source } = callState(margin, edited, scenario.picks[code]);
    states[code] = { code, ev, margin, baseMargin, winner, rating, source, editedCounties: edited };
    totals[winner] += ev;
  }

  const districts: Record<string, DistrictOutcome> = {};
  const baselines = scenario.base !== null ? DISTRICT_BASELINES[scenario.base] ?? {} : {};
  for (const code of DISTRICT_CODES) {
    const set = scenario.districts[code];
    const baseline = blank ? undefined : baselines[code];
    const winner: Outcome = set ?? baseline ?? states[districtState(code)].winner;
    districts[code] = { code, winner, source: set ? "pick" : baseline ? "baseline" : "state" };
    totals[winner] += 1;
  }

  return { states, districts, counties, totals };
}

/**
 * What a click on a state does next. A state with a result flips to the other party, then becomes
 * a tossup, then goes back to its computed result (null). On a blank map it goes D, R, then back.
 * Flips start at "lean" since they are close calls; picks on a blank map start at "safe".
 */
export function nextPick(current: Pick | undefined, computed: Outcome): Pick | null {
  if (computed === "T") {
    if (!current) return { party: "D", rating: "safe" };
    return current.party === "D" ? { party: "R", rating: "safe" } : null;
  }
  const other: Side = computed === "D" ? "R" : "D";
  if (!current) return { party: other, rating: "lean" };
  if (current.party === other) return { party: "T" };
  return null;
}

/** "D+4.7", "R+0.3", "R+0.01" for margins too close for one decimal, or "Even". */
export function formatMargin(margin: number | null) {
  if (margin === null) return "–";
  if (margin === 0) return "Even";
  const size = Math.abs(margin);
  return `${margin > 0 ? "D" : "R"}+${size < 0.1 ? Math.max(size, 0.01).toFixed(2) : round1(size).toFixed(1)}`;
}

const binIndex = (margin: number) => MARGIN_BREAKS.filter((limit) => Math.abs(margin) >= limit).length;
const ratingBin: Record<Rating, number> = { lean: 1, likely: 2, safe: 4 };

/**
 * Colour bin per map feature, using the Past results colours so a simulated map reads like a real
 * one: party and margin for computed results, the rating's shade for picks, and "tossup".
 */
export function simBins(result: SimulationResult, layer: "states" | "counties"): Map<string, string> {
  const bins = new Map<string, string>();
  if (layer === "counties") {
    for (const [fips, margin] of result.counties) {
      const side = winnerOf(margin);
      bins.set(fips, side === "T" ? "tossup" : `${side}${binIndex(margin)}`);
    }
    return bins;
  }
  for (const state of Object.values(result.states)) {
    if (state.winner === "T") bins.set(state.code, "tossup");
    else if (state.source === "pick") bins.set(state.code, `${state.winner}${ratingBin[state.rating!]}`);
    else bins.set(state.code, `${state.winner}${binIndex(state.margin!)}`);
  }
  return bins;
}
