import { useQuery } from "@tanstack/react-query";
import { nationalPollsEnabled } from "@/lib/featureFlags";
import { getPolls, PollsError, type AverageStatus, type PollPopulation, type PollsSource } from "./polls";

/** Mirrors backend/src/services/polls/national.ts. */
export interface NationalPoll {
  id: string;
  pollster: string;
  startDate: string | null;
  endDate: string;
  sampleSize: number | null;
  population: PollPopulation;
  /** The party a sponsoring committee works for ("DEM", "REP"); such polls are never averaged. */
  partisan: string | null;
  url: string | null;
  inAverage: boolean;
  answers: Array<{ choice: string; pct: number }>;
}

interface Series {
  status: AverageStatus;
  windowDays: number;
  pollsterCount: number;
  newestEndDate: string | null;
  recent: NationalPoll[];
}

export interface ApprovalSeries extends Series {
  subject: string;
  approve: number | null;
  disapprove: number | null;
  /** Approve minus disapprove, in points. */
  net: number | null;
}

export interface GenericBallotSeries extends Series {
  dem: number | null;
  rep: number | null;
  /** Democratic minus Republican share, in points. */
  margin: number | null;
}

export interface NationalEnvironment {
  method: string;
  asOf: string;
  fetchedAt: string;
  approval: ApprovalSeries;
  genericBallot: GenericBallotSeries;
  source: Omit<PollsSource, "lastSyncedAt">;
}

/** Presidential approval and the generic ballot. The API reads VoteHub every 3 hours and caches for 15 minutes. */
export function useNationalPolls() {
  return useQuery<NationalEnvironment, Error>({
    queryKey: ["polls", "national"],
    enabled: nationalPollsEnabled,
    staleTime: 15 * 60_000,
    retry: (count, error) => !(error instanceof PollsError && error.code === "DISABLED") && count < 1,
    queryFn: ({ signal }) => getPolls<NationalEnvironment>("/national", signal),
  });
}
