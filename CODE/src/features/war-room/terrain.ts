import type { AreaResult } from "@/features/election-monitor/pastResults";
import { partyLetter } from "./party";

/** "R+5.2" from a past race, or what kept it from having a margin. */
export function marginText(result: AreaResult) {
  if (result.status === "unopposed") return `Unopposed (${partyLetter(result.winner?.party)})`;
  if (result.status !== "ok" || result.margin === undefined || !result.winner) return "No result on file";
  return `${partyLetter(result.winner.party)}+${result.margin.toFixed(1)}`;
}

/**
 * Democratic share minus Republican share, in points, for a margin bar that runs left for D and right for R.
 * Null when the top two were not a Democrat and a Republican (a top-two race between two Republicans, say), so
 * such a race is never drawn as if it were close.
 */
export function demMargin(result: AreaResult): number | null {
  if (result.status !== "ok") return null;
  if (result.shares) return result.shares.d - result.shares.r;
  const { winner, runnerUp, margin } = result;
  if (!winner || !runnerUp || margin === undefined) return null;
  if (winner.party === "D" && runnerUp.party === "R") return margin;
  if (winner.party === "R" && runnerUp.party === "D") return -margin;
  return null;
}
