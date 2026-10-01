import { useQuery } from "@tanstack/react-query";
import { loadMockDashboard } from "@/features/election-dashboard/mockApi";
import type { SourceStatusContract } from "@/features/election-dashboard/types";
import { mockResultsProviderEnabled } from "@/lib/featureFlags";
import { FICTIONAL_STATE_CODE } from "./constants";
import type { MonitorContest, MonitorResults } from "./types";

export interface MockResultsFeed {
  contests: MonitorContest[];
  resultsByContest: Record<string, MonitorResults>;
  stateName: string;
  generatedAt: string;
}

/**
 * Fictional results fixtures from /api/v1. Only queried when
 * VITE_RESULTS_PROVIDER_MOCK_ENABLED is on; otherwise the dashboard has no
 * results source at all and must say so instead of showing zeros.
 */
export function useMockResultsFeed() {
  return useQuery({
    queryKey: ["election-monitor", "mock-results"],
    enabled: mockResultsProviderEnabled,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<MockResultsFeed> => {
      const data = await loadMockDashboard(signal);
      const contests: MonitorContest[] = data.contests.map((contest) => ({
        id: contest.id,
        stateCode: FICTIONAL_STATE_CODE,
        office: contest.officeType,
        district: contest.districtCode ? contest.districtCode.padStart(2, "0") : null,
        title: contest.officeTitle,
        electionDate: null,
        electionType: "GENERAL",
        isFictional: true,
        candidates: data.candidates
          .filter((candidate) => contest.candidateIds.includes(candidate.id))
          .sort((a, b) => (a.ballotOrder ?? 99) - (b.ballotOrder ?? 99))
          .map((candidate) => ({
            id: candidate.id,
            name: candidate.displayName,
            party: candidate.party?.name ?? null,
            isIncumbent: false,
          })),
      }));

      const resultsByContest: Record<string, MonitorResults> = {};
      for (const result of data.results) {
        const meta = data.metadataByContest[result.contestId] ?? data.metadata;
        resultsByContest[result.contestId] = {
          contestId: result.contestId,
          status: result.status,
          certificationState: result.certificationState,
          totalVotes: result.totalVotes,
          reported: result.reportingProgress.precincts.reported,
          total: result.reportingProgress.precincts.total,
          reportingPercent: result.reportingProgress.precincts.percentage,
          candidates: result.candidateResults.map(({ candidateId, votes, percentage }) => ({ candidateId, votes, percentage })),
          units: result.reportingUnits.map((unit) => ({
            id: unit.reportingUnit.id,
            name: unit.reportingUnit.name,
            type: unit.reportingUnit.type,
            countyFips: unit.reportingUnit.countyFips,
            reported: unit.reported,
            total: unit.total,
          })),
          updatedAt: result.updatedAt,
          meta,
        };
      }

      const stateName = data.manifest.states.find((state) => state.code === FICTIONAL_STATE_CODE)?.name ?? "Fictional Example State";
      return { contests, resultsByContest, stateName, generatedAt: data.metadata.generatedAt };
    },
  });
}

/** Results-source health from /api/v1/sources/status (mock feed only for now). */
export function useResultsSourceStatus() {
  return useQuery({
    queryKey: ["election-monitor", "source-status"],
    enabled: mockResultsProviderEnabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const response = await fetch(`${baseUrl}/api/v1/sources/status`, { signal });
      if (!response.ok) throw new Error(`Source status returned ${response.status}`);
      const payload = (await response.json()) as { data: { sources: SourceStatusContract[] } };
      return payload.data.sources;
    },
  });
}
