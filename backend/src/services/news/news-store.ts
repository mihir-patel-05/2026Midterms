/**
 * Reads and writes the articles table for the news job.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { RawRelated } from './apify-actors.js';
import type { NormalizedArticle } from './normalize.js';
import { STORY_WINDOW_HOURS, type RelatedCoverage, type StoryArticle } from './trending.js';

const UPDATE_BATCH = 100;
const HOUR_MS = 60 * 60 * 1000;

/**
 * One row per article within a run: an article that several feeds returned keeps
 * every feed label, its best rank, and its longest related-coverage list.
 */
export function mergeBatch(articles: NormalizedArticle[]): Array<NormalizedArticle & { feeds: string[] }> {
  const byId = new Map<string, NormalizedArticle & { feeds: string[] }>();
  for (const article of articles) {
    const existing = byId.get(article.externalId);
    if (!existing) {
      byId.set(article.externalId, { ...article, feeds: [article.feed] });
      continue;
    }
    if (!existing.feeds.includes(article.feed)) existing.feeds.push(article.feed);
    if (article.position !== null && (existing.position === null || article.position < existing.position)) existing.position = article.position;
    if (article.related.length > existing.related.length) existing.related = article.related;
    existing.snippet ??= article.snippet;
  }
  return [...byId.values()];
}

export interface StoreStats {
  inserted: number;
  updated: number;
}

/**
 * Insert new articles and refresh the ones already stored: last seen time, feed
 * labels, rank (only when this run ranked it), and related coverage.
 */
export async function storeArticles(
  db: PrismaClient,
  sourceId: string,
  ingestionRunId: string,
  articles: Array<NormalizedArticle & { feeds: string[] }>,
  seenAt: Date,
): Promise<StoreStats> {
  if (articles.length === 0) return { inserted: 0, updated: 0 };
  const stored = await db.article.findMany({
    where: { sourceId, externalId: { in: articles.map((article) => article.externalId) } },
    select: { id: true, externalId: true, foundBy: true, snippet: true },
  });
  const byExternalId = new Map(stored.map((row) => [row.externalId, row]));
  const inserts: Prisma.ArticleCreateManyInput[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const article of articles) {
    const existing = byExternalId.get(article.externalId);
    const related = article.related.length ? (article.related as unknown as Prisma.InputJsonValue) : undefined;
    if (!existing) {
      inserts.push({
        sourceId,
        ingestionRunId,
        externalId: article.externalId,
        url: article.url,
        canonicalUrl: article.canonicalUrl,
        headline: article.headline,
        snippet: article.snippet,
        outlet: article.outlet,
        outletKey: article.outletKey,
        outletDomain: article.outletDomain,
        publishedAt: article.publishedAt,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
        foundBy: article.feeds,
        feedPosition: article.position,
        feedPositionAt: article.position === null ? null : seenAt,
        related: related ?? Prisma.JsonNull,
      });
      continue;
    }
    updates.push(db.article.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: seenAt,
        foundBy: [...new Set([...existing.foundBy, ...article.feeds])],
        ...(article.position === null ? {} : { feedPosition: article.position, feedPositionAt: seenAt }),
        ...(related ? { related } : {}),
        ...(existing.snippet === null && article.snippet ? { snippet: article.snippet } : {}),
      },
    }));
  }
  const inserted = inserts.length ? (await db.article.createMany({ data: inserts, skipDuplicates: true })).count : 0;
  for (let i = 0; i < updates.length; i += UPDATE_BATCH) await db.$transaction(updates.slice(i, i + UPDATE_BATCH));
  return { inserted, updated: updates.length };
}

function relatedOf(value: Prisma.JsonValue | null): RelatedCoverage[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown as RawRelated[]).map((entry) => ({ headline: entry?.headline ?? null, outlet: entry?.outlet ?? null, url: entry?.url ?? null }));
}

/** Articles last seen in the story window, ready for clustering. */
export async function loadStoryArticles(db: PrismaClient, sourceKey: string, now: Date): Promise<StoryArticle[]> {
  const rows = await db.article.findMany({
    where: { source: { key: sourceKey }, lastSeenAt: { gte: new Date(now.getTime() - STORY_WINDOW_HOURS * HOUR_MS) } },
    select: { id: true, headline: true, snippet: true, outlet: true, outletKey: true, url: true, publishedAt: true, foundBy: true, feedPosition: true, feedPositionAt: true, related: true },
    orderBy: { publishedAt: 'desc' },
    take: 5000,
  });
  return rows.map((row) => ({ ...row, related: relatedOf(row.related) }));
}
