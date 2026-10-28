/**
 * The published top stories for GET /api/news/top. Stories older than 24 hours
 * are never served, even when the sync has stopped and they are still stored.
 */
import type { NewsSelectionMethod, NewsTopic, PrismaClient } from '@prisma/client';
import { NEWS_SOURCE_KEY } from './news-sync.js';

export const NEWS_WINDOW_HOURS = 24;

export interface TopStoryItem {
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
  /** When the shown list was published; null before the first successful run. */
  updatedAt: string | null;
  /** When a run last checked for news, successful or not. */
  checkedAt: string | null;
  method: NewsSelectionMethod | null;
  /** Usable articles and grouped stories the list was chosen from. */
  articlesConsidered: number | null;
  storiesConsidered: number | null;
  attribution: string | null;
  stories: TopStoryItem[];
}

function alsoCovered(value: unknown): TopStoryItem['alsoCoveredBy'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (item && typeof item === 'object' && typeof item.outlet === 'string' && typeof item.url === 'string'
    ? [{ outlet: item.outlet, url: item.url }]
    : []));
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export async function getTopStories(db: PrismaClient, options: { now?: Date; topic?: NewsTopic; sourceKey?: string } = {}): Promise<TopStoriesData> {
  const { now = new Date(), topic, sourceKey = NEWS_SOURCE_KEY } = options;
  const since = new Date(now.getTime() - NEWS_WINDOW_HOURS * 3_600_000);
  const [source, rows] = await Promise.all([
    db.dataSource.findUnique({ where: { key: sourceKey }, select: { attributionText: true, lastCheckedAt: true } }),
    db.newsStory.findMany({
      where: { ingestionRun: { source: { key: sourceKey } }, publishedAt: { gte: since }, ...(topic ? { topic } : {}) },
      orderBy: { rank: 'asc' },
      include: { ingestionRun: { select: { completedAt: true, metadata: true } } },
    }),
  ]);
  // Every stored row comes from the same run; without rows, report the newest published run.
  const run = rows[0]?.ingestionRun ?? await db.ingestionRun.findFirst({
    where: { source: { key: sourceKey }, status: 'SUCCEEDED' },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true, metadata: true },
  });
  const metadata = (run?.metadata ?? {}) as Record<string, unknown>;
  return {
    windowHours: NEWS_WINDOW_HOURS,
    updatedAt: run?.completedAt?.toISOString() ?? null,
    checkedAt: source?.lastCheckedAt?.toISOString() ?? null,
    method: rows[0]?.selectedBy ?? (metadata.method === 'AI' || metadata.method === 'RANKED' ? metadata.method : null),
    articlesConsidered: count(metadata.articles),
    storiesConsidered: count(metadata.candidates),
    attribution: source?.attributionText ?? null,
    stories: rows.map((row) => ({
      rank: row.rank,
      headline: row.headline,
      snippet: row.snippet,
      outlet: row.outlet,
      outletDomain: row.outletDomain,
      url: row.url,
      publishedAt: row.publishedAt.toISOString(),
      topic: row.topic,
      stateCode: row.stateCode,
      outletCount: row.outletCount,
      alsoCoveredBy: alsoCovered(row.alsoCoveredBy),
    })),
  };
}
