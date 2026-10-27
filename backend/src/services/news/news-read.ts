/**
 * What GET /api/news/top serves: the national list of election stories.
 *
 * Mode "trending" ranks stored articles with the deterministic trending score
 * (trending.ts). Mode "none" says why there is nothing to show, never an empty box.
 */
import type { PrismaClient } from '@prisma/client';
import { loadStoryArticles } from './news-store.js';
import { NEWS_SOURCE_KEY } from './news-sync.js';
import { rankStories, TRENDING_VERSION, type TrendingStory } from './trending.js';

export interface TopStoryItem {
  articleId: string;
  headline: string;
  outlet: string;
  url: string;
  publishedAt: string;
  outletCount: number;
  googlePosition: number | null;
  /** The agent's reason code, in "top" mode. */
  reason: string | null;
  /** Races the agent tied the story to, in "top" mode: "PA-SEN", "AZ-06". */
  raceKeys: string[];
  alsoCoveredBy: Array<{ outlet: string; url: string }>;
}

export interface TopStoriesData {
  mode: 'top' | 'trending' | 'none';
  /** Why the list is in this mode, when it isn't the normal one. */
  reason: string | null;
  updatedAt: string | null;
  /** Election stories the list was chosen from. */
  consideredCount: number;
  trendingVersion: number;
  items: TopStoryItem[];
}

export function storyItem(story: TrendingStory): TopStoryItem {
  return {
    articleId: story.lead.id,
    headline: story.lead.headline,
    outlet: story.lead.outlet,
    url: story.lead.url,
    publishedAt: story.lead.publishedAt.toISOString(),
    outletCount: story.outletCount,
    googlePosition: story.bestPosition,
    reason: null,
    raceKeys: [],
    alsoCoveredBy: story.alsoCoveredBy,
  };
}

/** Every election story in the window, ranked. */
export async function loadTrending(db: PrismaClient, sourceKey: string, now: Date): Promise<TrendingStory[]> {
  return rankStories(await loadStoryArticles(db, sourceKey, now), now, { limit: Number.POSITIVE_INFINITY });
}

async function lastCollectedAt(db: PrismaClient, sourceKey: string): Promise<Date | null> {
  const run = await db.ingestionRun.findFirst({
    where: { source: { key: sourceKey }, status: { in: ['SUCCEEDED', 'PARTIAL'] } },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  });
  return run?.completedAt ?? null;
}

export async function getTrendingStories(
  db: PrismaClient,
  options: { limit: number; now?: Date; sourceKey?: string; reason?: string | null },
): Promise<TopStoriesData> {
  const { limit, now = new Date(), sourceKey = NEWS_SOURCE_KEY } = options;
  const [stories, collectedAt] = await Promise.all([loadTrending(db, sourceKey, now), lastCollectedAt(db, sourceKey)]);
  const base = { updatedAt: collectedAt?.toISOString() ?? null, consideredCount: stories.length, trendingVersion: TRENDING_VERSION };
  if (stories.length === 0) {
    return { ...base, mode: 'none', reason: collectedAt ? 'No election stories in the past 48 hours.' : 'News has not been collected yet.', items: [] };
  }
  return { ...base, mode: 'trending', reason: options.reason ?? null, items: stories.slice(0, limit).map(storyItem) };
}
