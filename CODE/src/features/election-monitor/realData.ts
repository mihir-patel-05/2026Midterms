import { useQuery } from "@tanstack/react-query";
import { getElectionsByState, getStateElectionCounts } from "@/lib/api";
import type { Election } from "@/types/candidate";
import { displayName } from "./constants";
import type { MonitorCandidate, MonitorContest } from "./types";

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

type FecEntry = NonNullable<Election["candidateElections"]>[number];

function fecCandidate(entry: FecEntry): MonitorCandidate {
  const totals = entry.candidate!.financials?.[0];
  return {
    id: entry.candidate!.id,
    profileId: entry.candidate!.id,
    fecId: entry.candidate!.candidateId,
    name: displayName(entry.candidate!.name),
    party: entry.candidate!.party ?? null,
    isIncumbent: entry.isIncumbent,
    ballotStatus: entry.ballotStatus,
    receipts: totals ? Number(totals.receipts) : null,
    cashOnHand: totals ? Number(totals.cashOnHand) : null,
    fundingThrough: totals?.coverageEndDate?.slice(0, 10) ?? null,
  };
}

/**
 * Who is running. With the general election ballot on file, exactly the candidates on it,
 * in ballot order, with FEC finances where a filing matched; candidates with no FEC record
 * still appear. Without it, every active FEC filer, which can include primary losers.
 */
export function contestCandidates(election: Election): MonitorCandidate[] {
  const filings = (election.candidateElections ?? []).filter((entry) => entry.candidate);
  const ballot = election.normalizedContest?.candidacies ?? [];
  if (ballot.length > 0) {
    return ballot.map((candidacy) => {
      const filing = filings.find((entry) => entry.candidate!.id === candidacy.legacyCandidateId);
      const name = candidacy.person.displayName || candidacy.ballotName || "Unnamed candidate";
      const party = candidacy.party?.name ?? null;
      if (filing) return { ...fecCandidate(filing), name, party: party ?? filing.candidate!.party ?? null, isIncumbent: candidacy.isIncumbent || filing.isIncumbent, ballotStatus: "CONFIRMED" };
      return { id: candidacy.id, fecId: candidacy.fecCandidateId ?? undefined, name, party, isIncumbent: candidacy.isIncumbent, ballotStatus: "CONFIRMED", receipts: null, cashOnHand: null, fundingThrough: null };
    });
  }
  return filings
    .map(fecCandidate)
    // FEC lists every active filer, including primary losers it has not
    // marked inactive, so lead with the incumbent and the biggest fundraisers.
    .sort((a, b) => Number(b.isIncumbent) - Number(a.isIncumbent) || (b.receipts ?? -1) - (a.receipts ?? -1) || a.name.localeCompare(b.name));
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
    candidates: contestCandidates(election),
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
