import { stateMapItems } from "@/features/election-dashboard/map";
import type { Outcome, Pick, Rating, StateSource } from "./model";

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

export function pickLabel(pick: Pick) {
  return pick.party === "T" ? "Tossup" : `${ratingLabels[pick.rating]} ${pick.party}`;
}

/** A swing reads as the direction it moves votes: "D+2.0 swing", or "No swing". */
export function swingLabel(swing: number) {
  return swing === 0 ? "No swing" : `${swing > 0 ? "D" : "R"}+${Math.abs(swing).toFixed(1)} swing`;
}
