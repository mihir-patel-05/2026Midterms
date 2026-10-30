import type { RaceOutsideSpending } from "@/lib/api";
import type { MonitorContest } from "@/features/election-monitor/types";

/**
 * Outside money in one race, split by which side it helps: spending for the Democrat plus spending against the
 * Republican, and the reverse. Each part is kept, so support and opposition are shown, never netted. Money about
 * a candidate who is neither (or not matched to the ballot list) is counted apart.
 */
export interface SpendingSides {
  forD: number;
  againstR: number;
  forR: number;
  againstD: number;
  other: number;
}

export function spendingSides(spending: RaceOutsideSpending, contest: MonitorContest | undefined): SpendingSides {
  const partyOf = new Map((contest?.candidates ?? []).flatMap((candidate) => (candidate.fecId ? [[candidate.fecId, (candidate.party ?? "").toUpperCase()]] : [])));
  const sides: SpendingSides = { forD: 0, againstR: 0, forR: 0, againstD: 0, other: 0 };
  for (const item of spending.candidates) {
    const party = item.candidateId ? partyOf.get(item.candidateId) ?? "" : "";
    if (party.includes("DEM")) {
      sides.forD += item.support;
      sides.againstD += item.oppose;
    } else if (party.includes("REP")) {
      sides.forR += item.support;
      sides.againstR += item.oppose;
    } else sides.other += item.support + item.oppose;
  }
  return sides;
}
