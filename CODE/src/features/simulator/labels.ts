import { stateMapItems } from "@/features/election-dashboard/map";
import { formatMargin, type Outcome, type Pick, type Rating, type StateOutcome, type StateSource } from "./model";

/** The tile-map list has the 50 states; DC votes for president too. */
export const STATE_NAMES: Record<string, string> = {
  ...Object.fromEntries(stateMapItems.map((item) => [item.code, item.name])),
  DC: "District of Columbia",
};

export const ratingLabels: Record<Rating, string> = { safe: "Safe", likely: "Likely", lean: "Lean" };
export const outcomeWords: Record<Outcome, string> = { D: "Democrats", R: "Republicans", T: "Tossup" };
export const sourceLabels: Record<StateSource, string> = {
  pick: "your pick",
  counties: "from counties",
  baseline: "baseline",
  tossup: "not set",
};

/** "Tossup", "Lean D", or "D+2.5 (Lean D)" for a pick with an exact margin. */
export function pickLabel(pick: Pick) {
  if (pick.party === "T") return "Tossup";
  const rating = `${ratingLabels[pick.rating]} ${pick.party}`;
  return pick.margin === undefined ? rating : `${formatMargin(pick.margin)} (${rating})`;
}

/** A state's result in the tables: its margin, its pick's margin or rating, or "Tossup". */
export function resultLabel(state: StateOutcome) {
  if (state.winner === "T" && state.source !== "baseline") return "Tossup";
  if (state.source !== "pick") return formatMargin(state.margin);
  return state.pickMargin !== null ? formatMargin(state.pickMargin) : `${ratingLabels[state.rating!]} ${state.winner}`;
}

/** A swing reads as the direction it moves votes: "D+2.0 swing", or "No swing". */
export function swingLabel(swing: number) {
  return swing === 0 ? "No swing" : `${swing > 0 ? "D" : "R"}+${Math.abs(swing).toFixed(1)} swing`;
}
