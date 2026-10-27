import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";

export interface TopStoryItem {
  articleId: string;
  headline: string;
  outlet: string;
  url: string;
  publishedAt: string;
  outletCount: number;
  googlePosition: number | null;
  reason: string | null;
  raceKeys: string[];
  alsoCoveredBy: Array<{ outlet: string; url: string }>;
}

export interface TopStoriesData {
  mode: "top" | "trending" | "none";
  reason: string | null;
  updatedAt: string | null;
  consideredCount: number;
  trendingVersion: number;
  items: TopStoryItem[];
}

/** GET /api/news/top. News runs every 2 hours, so a 5-minute stale time keeps the card fresh enough. */
export function useTopStories(limit = 8) {
  return useQuery<TopStoriesData, Error>({
    queryKey: ["election-monitor", "top-stories", limit],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/news/top?limit=${limit}`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body.data as TopStoriesData;
    },
  });
}

/** Links come from news feeds, so only http(s) URLs become links. */
export function safeHref(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Plain words for the agent's reason codes. */
export const REASON_LABELS: Record<string, string> = {
  CANDIDATE_NEWS: "Candidate news",
  DEBATE: "Debate",
  POLL: "Poll",
  MONEY_OR_ADS: "Money and ads",
  LEGAL_OR_ETHICS: "Legal or ethics",
  VOTING_RULES: "Voting rules",
  POLICY_OR_ECONOMY: "Policy or economy",
  NATIONAL_EVENT: "National event",
  RESULTS: "Results",
};

/** "PA-SEN" → { state: "PA", district: null }; "AZ-06" → { state: "AZ", district: "06" }. */
export function parseRaceKey(key: string): { state: string; district: string | null } | null {
  const match = /^([A-Z]{2})-(SEN|\d{2})$/.exec(key);
  if (!match) return null;
  return { state: match[1], district: match[2] === "SEN" ? null : match[2] };
}
