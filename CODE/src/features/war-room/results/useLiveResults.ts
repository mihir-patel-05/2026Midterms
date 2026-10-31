import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { liveResultsEnabled } from "@/lib/featureFlags";
import { isSupportedContract, type DashboardBootstrapResponse, type ElectionResultsResponseContract } from "@/features/election-dashboard/types";
import { indexBootstrap, toLiveRace, type LiveBoard, type LiveRace } from "./liveResults";

/** Browsers refresh every 30 seconds; the API caches each read for 10. */
export const RESULTS_REFRESH_MS = 30_000;

/** 404: the API serves no results routes (no provider connected). */
class NotConnected extends Error {}
/** 503 "No results source is available": the source was switched off, so shown numbers must clear. */
class SwitchedOff extends Error {}

export type LiveResultsState =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "not-connected" }
  | { kind: "switched-off" }
  /** The last good numbers stay on screen, labelled with their time. */
  | { kind: "ready"; board: LiveBoard; delayed: boolean; fetchedAt: number }
  | { kind: "unavailable" };

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (response.status === 404) throw new NotConnected();
  if (response.status === 503) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "No results source is available") throw new SwitchedOff();
  }
  if (!response.ok) throw new Error(`Results returned ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Every Senate and House result, without counties (`?units=none`). Shared by the Night screen, the map's
 * Results lens, the header chip and the dossier, so the browser makes one request per refresh.
 */
export function useLiveResults(): LiveResultsState {
  const query = useQuery({
    queryKey: ["war-room", "live-results"],
    enabled: liveResultsEnabled,
    refetchInterval: RESULTS_REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    retry: (count, error) => !(error instanceof NotConnected) && !(error instanceof SwitchedOff) && count < 1,
    queryFn: async ({ signal }) => {
      const payload = await getJson<DashboardBootstrapResponse>("/api/v1/bootstrap?units=none", signal);
      if (!isSupportedContract(payload.meta.contractVersion)) throw new Error(`Unexpected results contract ${payload.meta.contractVersion}`);
      return indexBootstrap(payload);
    },
  });
  if (!liveResultsEnabled) return { kind: "off" };
  if (query.error instanceof NotConnected) return { kind: "not-connected" };
  if (query.error instanceof SwitchedOff) return { kind: "switched-off" };
  if (query.data) return { kind: "ready", board: query.data, delayed: query.isError, fetchedAt: query.dataUpdatedAt };
  if (query.isError) return { kind: "unavailable" };
  return { kind: "loading" };
}

export const boardOf = (state: LiveResultsState): LiveBoard | null => (state.kind === "ready" ? state.board : null);

export interface ContestDetail {
  race: LiveRace | null;
  counties: Array<{
    fips: string | null;
    name: string;
    totalVotes: number;
    pctCounted: number | null;
    candidates: Array<{ candidateId: string; votes: number; pct: number }>;
  }>;
}

/** One race with its counties, for the dossier. Only tier A races have counties; the rest return none. */
export function useContestDetail(contestId: string | null) {
  return useQuery({
    queryKey: ["war-room", "contest-results", contestId],
    enabled: liveResultsEnabled && Boolean(contestId),
    refetchInterval: RESULTS_REFRESH_MS,
    staleTime: 10_000,
    retry: 1,
    queryFn: async ({ signal }): Promise<ContestDetail> => {
      const item = await getJson<ElectionResultsResponseContract>(`/api/v1/contests/${encodeURIComponent(contestId!)}/results/current`, signal);
      return {
        race: toLiveRace(item),
        counties: (item.data?.reportingUnitResults ?? [])
          .filter((unit) => unit.reportingUnit.type === "COUNTY")
          .map((unit) => ({
            fips: unit.reportingUnit.countyFips ?? null,
            name: unit.reportingUnit.name,
            totalVotes: unit.totalVotes,
            pctCounted: unit.reportingProgress.estimatedPercentage ?? unit.reportingProgress.precincts.percentage ?? null,
            candidates: unit.candidateResults.map((result) => ({ candidateId: result.candidateId, votes: result.votes, pct: result.percentage })),
          })),
      };
    },
  });
}
