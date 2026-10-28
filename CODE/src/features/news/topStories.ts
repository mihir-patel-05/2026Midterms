import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCheck, ChartColumn, CircleDollarSign, FileText, Landmark, Megaphone, Newspaper, Scale, Vote, type LucideIcon } from "lucide-react";
import { API_BASE_URL } from "@/lib/apiBase";
import { newsEnabled } from "@/lib/featureFlags";

export type NewsTopic = "CAMPAIGN" | "POLLS" | "CONGRESS" | "WHITE_HOUSE" | "COURTS" | "MONEY" | "VOTING" | "RESULTS" | "POLICY" | "OTHER";

export interface TopStory {
  rank: number;
  headline: string;
  snippet: string | null;
  outlet: string;
  outletDomain: string;
  url: string;
  publishedAt: string;
  topic: NewsTopic;
  stateCode: string | null;
  outletCount: number;
  alsoCoveredBy: Array<{ outlet: string; url: string }>;
}

export interface TopStoriesData {
  windowHours: number;
  updatedAt: string | null;
  checkedAt: string | null;
  method: "AI" | "RANKED" | null;
  articlesConsidered: number | null;
  storiesConsidered: number | null;
  attribution: string | null;
  stories: TopStory[];
}

/** Topics in display order. Every topic has the same neutral colour, so none reads as a party's. */
export const TOPICS: Record<NewsTopic, { label: string; icon: LucideIcon }> = {
  CAMPAIGN: { label: "Campaigns", icon: Megaphone },
  POLLS: { label: "Polls", icon: ChartColumn },
  CONGRESS: { label: "Congress", icon: Landmark },
  WHITE_HOUSE: { label: "White House", icon: Building2 },
  COURTS: { label: "Courts", icon: Scale },
  MONEY: { label: "Money", icon: CircleDollarSign },
  VOTING: { label: "Voting", icon: Vote },
  RESULTS: { label: "Results", icon: CheckCheck },
  POLICY: { label: "Policy", icon: FileText },
  OTHER: { label: "Other", icon: Newspaper },
};

export const NEWS_PATH = "/news";

/**
 * The past 24 hours' top political stories. The backend refreshes them every two
 * hours, so a five-minute stale time loses nothing; an open page refetches every ten.
 */
export function useTopStories() {
  return useQuery<TopStoriesData, Error>({
    queryKey: ["news", "top"],
    enabled: newsEnabled,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/news/top`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body.data as TopStoriesData;
    },
  });
}

/** "Just now", "45 min ago", "3 hr ago". Stories are at most a day old. */
export function timeAgo(iso: string, now: number = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : "1 day ago";
}

/** "10:32 AM ET", for exact times beside the relative ones. */
export function etClock(iso: string) {
  return `${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

/** "Oct 28, 10:32 AM ET", for tooltips. */
export function etDateTime(iso: string) {
  return `${new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

/** Topics that appear in the list, in display order, with their counts. */
export function topicCounts(stories: TopStory[]) {
  const counts = new Map<NewsTopic, number>();
  for (const story of stories) counts.set(story.topic, (counts.get(story.topic) ?? 0) + 1);
  return (Object.keys(TOPICS) as NewsTopic[]).filter((topic) => counts.has(topic)).map((topic) => ({ topic, count: counts.get(topic)! }));
}

/** The header line: who picked the list, from how much, and when. */
export function selectionSummary(data: TopStoriesData) {
  const from = data.articlesConsidered ? ` from ${data.articlesConsidered.toLocaleString("en-US")} articles` : "";
  const how = data.method === "AI" ? `Picked by AI${from}` : data.method === "RANKED" ? `Ranked by outlet coverage${from}` : null;
  const when = data.updatedAt ? `updated ${etClock(data.updatedAt)}` : null;
  return [how, when].filter(Boolean).join(" · ");
}

export const outletsLabel = (count: number) => `${count} ${count === 1 ? "outlet" : "outlets"}`;
