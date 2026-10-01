import { useQuery } from "@tanstack/react-query";
import { getElectionsByState, getStateElectionCounts } from "@/lib/api";
import type { Election } from "@/types/candidate";
import { displayName } from "./constants";
import type { MonitorContest } from "./types";

export const MONITOR_CYCLE = 2026;

/** Race counts per state for map colouring and the national summary. */
export function useStateCounts() {
  return useQuery({
    queryKey: ["election-monitor", "state-counts", MONITOR_CYCLE],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const response = await getStateElectionCounts(MONITOR_CYCLE);
      return Object.fromEntries(response.states.map((item) => [item.state.toUpperCase(), item.races])) as Record<string, number>;
    },
  });
}

function normaliseDistrict(value: string | undefined) {
  if (!value || !/^\d{1,2}$/.test(value.trim())) return null;
  return value.trim().padStart(2, "0");
}

export function toMonitorContest(election: Election): MonitorContest {
  const office = election.officeType.toUpperCase() === "SENATE" ? "US_SENATE" : "US_HOUSE";
  return {
    id: election.id,
    stateCode: election.state.toUpperCase(),
    office,
    district: office === "US_HOUSE" ? normaliseDistrict(election.district) : null,
    title: office === "US_SENATE" ? "U.S. Senate" : "U.S. House",
    electionDate: election.electionDate,
    electionType: election.electionType,
    candidates: (election.candidateElections ?? [])
      .filter((entry) => entry.candidate)
      .map((entry) => ({
        id: entry.candidate!.id,
        profileId: entry.candidate!.id,
        fecId: entry.candidate!.candidateId,
        name: displayName(entry.candidate!.name),
        party: entry.candidate!.party ?? null,
        isIncumbent: entry.isIncumbent,
        ballotStatus: entry.ballotStatus,
      }))
      .sort((a, b) => Number(b.isIncumbent) - Number(a.isIncumbent) || a.name.localeCompare(b.name)),
  };
}

/**
 * General-election contests for one state. Primaries are omitted: the monitor
 * is about the November ballot, and each seat would otherwise appear twice.
 */
export function useStateContests(stateCode: string | null) {
  return useQuery({
    queryKey: ["election-monitor", "state-contests", stateCode, MONITOR_CYCLE],
    enabled: Boolean(stateCode),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const response = await getElectionsByState(stateCode!, MONITOR_CYCLE);
      return response.elections
        .filter((election) => election.electionType.toUpperCase() === "GENERAL")
        .map(toMonitorContest)
        .sort((a, b) => (a.office === b.office ? (a.district ?? "").localeCompare(b.district ?? "") : a.office === "US_SENATE" ? -1 : 1));
    },
  });
}
