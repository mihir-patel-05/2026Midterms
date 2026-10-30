import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { newsEnabled } from "@/lib/featureFlags";
import type { MonitorContest } from "./types";

/** Mirrors backend/src/services/news/latest-coverage.ts. */
export interface NewsItem {
  headline: string;
  outlet: string | null;
  url: string;
  publishedAt: string | null;
}

export interface NewsData {
  mode: "latest" | "top" | "none";
  reason?: string;
  scope: { key: string; label: string; query: string };
  updatedAt: string;
  items: NewsItem[];
  source: { name: string; attribution: string };
}

/** The race key the news API and Kalshi share: "PA-SEN", "PA-07", "DE-00". */
export function newsRaceKey(contest: MonitorContest | undefined): string | null {
  if (!contest || contest.isFictional) return null;
  if (contest.office === "US_SENATE") return `${contest.stateCode}-SEN`;
  return contest.district ? `${contest.stateCode}-${contest.district}` : null;
}

/** "SMITH, JOHN A." → "John A. Smith"; names with digits or brackets are left out of the search. */
export function searchName(raw: string) {
  const [last, rest] = raw.split(",").map((part) => part.trim());
  const ordered = (rest ? `${rest} ${last}` : raw).replace(/\s+/g, " ").trim();
  const cased = ordered.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  return /^[\p{L}][\p{L} .'’-]{1,59}$/u.test(cased) ? cased : null;
}

/** Up to four names to search for: incumbents first, then the best-funded candidates. */
export function contestSearchNames(contest: MonitorContest | undefined): string[] {
  if (!contest) return [];
  const ranked = [...contest.candidates].sort((a, b) => Number(b.isIncumbent) - Number(a.isIncumbent) || (b.receipts ?? 0) - (a.receipts ?? 0));
  return [...new Set(ranked.flatMap((candidate) => searchName(candidate.name) ?? []))].slice(0, 4);
}

async function getNews(path: string, signal: AbortSignal): Promise<NewsData> {
  const response = await fetch(`${API_BASE_URL}/api/news/${path}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body.data as NewsData;
}

// The API caches searches for ten minutes; polling faster would only repeat them.
const REFRESH = { staleTime: 5 * 60_000, refetchInterval: 10 * 60_000, retry: 1 } as const;

export function useRaceNews(raceKey: string | null, names: string[]) {
  return useQuery<NewsData, Error>({
    queryKey: ["election-monitor", "news", "race", raceKey, names.join(",")],
    enabled: newsEnabled && Boolean(raceKey),
    ...REFRESH,
    queryFn: ({ signal }) => getNews(`races/${raceKey}?${new URLSearchParams({ limit: "8", ...(names.length ? { names: names.join(",") } : {}) })}`, signal),
  });
}

export function useTopNews(state: string | null) {
  return useQuery<NewsData, Error>({
    queryKey: ["election-monitor", "news", "top", state],
    enabled: newsEnabled,
    ...REFRESH,
    queryFn: ({ signal }) => getNews(`top?${new URLSearchParams({ limit: "10", ...(state ? { state } : {}) })}`, signal),
  });
}
