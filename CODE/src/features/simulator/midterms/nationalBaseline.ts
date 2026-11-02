import { clamp, SWING_LIMIT } from "../useSimulatorParams";

/**
 * 2024 national margins, in points of all votes cast (positive for Democrats), from the MIT
 * Election Lab files the simulator runs on: the presidential vote summed over the states, and the
 * House vote summed over every general-election candidate (unopposed seats count no votes).
 * nationalBaseline.test.ts checks both against the files.
 */
export const PRESIDENT_2024_MARGIN = -1.5;
export const HOUSE_2024_MARGIN = -2.7;

export interface ImpliedSwing {
  /** Generic ballot margin minus the baseline margin, to a tenth of a point. */
  swing: number;
  /** The same, rounded to the sliders' half-point steps and capped at their range. */
  slider: number;
  capped: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** How far the generic ballot is from a 2024 baseline, as a uniform swing. */
export function impliedSwing(genericMargin: number, baselineMargin: number): ImpliedSwing {
  const swing = round1(genericMargin - baselineMargin);
  const half = Math.round(swing * 2) / 2;
  return { swing, slider: clamp(half, SWING_LIMIT), capped: Math.abs(half) > SWING_LIMIT };
}

/**
 * The swings the generic congressional ballot implies for each map. The Senate map starts from the
 * 2024 presidential vote, so its swing is measured against that; the House map starts from the
 * 2024 House results. No pollster asks a generic Senate ballot, so the Senate swing reuses the
 * congressional question.
 */
export function nationalSwings(genericMargin: number) {
  return {
    senate: impliedSwing(genericMargin, PRESIDENT_2024_MARGIN),
    house: impliedSwing(genericMargin, HOUSE_2024_MARGIN),
  };
}
