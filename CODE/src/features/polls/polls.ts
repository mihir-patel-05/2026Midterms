import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { pollsEnabled } from "@/lib/featureFlags";

/** Mirrors backend/src/services/polls/average.ts (method polls-avg-v1). */
export type AverageStatus = "average" | "too_few" | "stale" | "none";

export interface AverageCandidate {
  /** The FEC ID when the answer matched a candidate, otherwise "name:" and the answer. */
  key: string;
  name: string;
  party: string | null;
  candidateFecId: string | null;
  pct: number;
  polls: number;
}

export interface PollAverage {
  status: AverageStatus;
  method: string;
  windowDays: number;
  asOf: string;
  pollIds: string[];
  pollsterCount: number;
  newestEndDate: string | null;
  candidates: AverageCandidate[];
  leaderKey: string | null;
  /** Leader minus runner-up in points; null when tied or not averaged. */
  margin: number | null;
}

export interface PollAnswer {
  choice: string;
  pct: number;
  party: string | null;
  candidateFecId: string | null;
}

export type PollPopulation = "LV" | "RV" | "A" | "V" | "UNKNOWN";

export interface Poll {
  id: string;
  pollster: string;
  sponsors: string[];
  startDate: string | null;
  endDate: string;
  sampleSize: number | null;
  population: PollPopulation;
  isInternal: boolean;
  url: string | null;
  inAverage: boolean;
  answers: PollAnswer[];
}

export interface PollsSource {
  name: string;
  attribution: string;
  licenseUrl: string;
  homepageUrl: string;
  lastSyncedAt: string | null;
}

export interface RacePolls {
  race: string;
  average: PollAverage;
  polls: Poll[];
  totalPolls: number;
  source: PollsSource;
}

/** Why polls could not be shown: off, not connected, not synced yet, or unreachable. */
export type PollsErrorCode = "DISABLED" | "NOT_CONFIGURED" | "NOT_LOADED" | "UNAVAILABLE";

export class PollsError extends Error {
  constructor(readonly code: PollsErrorCode, message: string) {
    super(message);
    this.name = "PollsError";
  }
}

export async function getPolls<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/polls${path}`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PollsError("UNAVAILABLE", "The polls API could not be reached");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code: PollsErrorCode = ["DISABLED", "NOT_CONFIGURED", "NOT_LOADED"].includes(body.code) ? body.code : "UNAVAILABLE";
    throw new PollsError(code, body.error ?? `HTTP ${response.status}`);
  }
  return body.data as T;
}

/** "PA-SEN", "PA-07", or "AK-00" for a Senate or House race; null for anything else. */
export function raceCodeFor(office: string, stateCode: string, district: string | null | undefined): string | null {
  const state = stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) return null;
  const kind = office.toUpperCase();
  if (kind === "US_SENATE" || kind === "SENATE" || kind === "S") return `${state}-SEN`;
  if (kind !== "US_HOUSE" && kind !== "HOUSE" && kind !== "H") return null;
  const seat = district?.trim();
  if (!seat || !/^\d{1,2}$/.test(seat)) return null;
  return `${state}-${seat.padStart(2, "0")}`;
}

/** The API's cache is 5 minutes and syncs run every 3 hours. */
const STALE_MS = 5 * 60_000;
const retry = (count: number, error: Error) => !(error instanceof PollsError && error.code !== "UNAVAILABLE") && count < 1;

/** A race's published polls and polling average. Off (never fetched) without a race or with the flag off. */
export function useRacePolls(race: string | null) {
  return useQuery<RacePolls, Error>({
    queryKey: ["polls", "race", race],
    enabled: pollsEnabled && Boolean(race),
    staleTime: STALE_MS,
    retry,
    queryFn: ({ signal }) => getPolls<RacePolls>(`?${new URLSearchParams({ race: race! })}`, signal),
  });
}
