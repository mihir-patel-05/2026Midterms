import type {
  CandidateContract,
  ContestResultViewModel,
  ContestViewModel,
  DashboardBootstrapResponse,
  ResponseMetadataContract,
} from "./types";

export interface MockDashboardData {
  contests: ContestViewModel[];
  candidates: CandidateContract[];
  results: ContestResultViewModel[];
  metadata: ResponseMetadataContract;
  metadataByContest: Record<string, ResponseMetadataContract>;
}

export async function loadMockDashboard(signal?: AbortSignal): Promise<MockDashboardData> {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const response = await fetch(`${baseUrl}/api/v1/bootstrap`, { signal });
  if (!response.ok) throw new Error(`Mock results API returned ${response.status}`);
  const payload = (await response.json()) as DashboardBootstrapResponse;
  if (payload.meta.contractVersion !== "1.0.0" || !payload.meta.isMockData || payload.meta.dataMode !== "MOCK") {
    throw new Error("Unexpected results contract or data mode");
  }

  const available = payload.data.results.filter((item) => item.data !== null);
  const contests: ContestViewModel[] = available.map(({ data }) => ({
    ...data!.contest,
    candidateIds: data!.candidates.map((candidate) => candidate.id),
  }));
  const candidates = available.flatMap(({ data }) => data!.candidates);
  const results: ContestResultViewModel[] = available.map(({ data }) => ({
    contestId: data!.contest.id,
    status: data!.status,
    certificationState: data!.certificationState,
    reportingProgress: data!.reportingProgress,
    totalVotes: data!.totalVotes,
    candidateResults: data!.candidateResults,
    reportingUnits: data!.reportingUnitResults.map((unit) => ({
      reportingUnit: unit.reportingUnit,
      reported: unit.reportingProgress.reportingUnits.reported,
      total: unit.reportingProgress.reportingUnits.total,
    })),
    updatedAt: data!.updatedAt,
  }));

  const metadataByContest = Object.fromEntries(available.map((item) => [item.data!.contest.id, item.meta]));

  return { contests, candidates, results, metadata: payload.meta, metadataByContest };
}
