/**
 * One news run: search Apify for the past day's national politics coverage,
 * clean and group it in memory, pick the top stories, and replace the stored
 * list (docs/plans/news-agents.md, "Scope change").
 *
 * Only the published list is written: news_stories holds at most `limit` rows
 * at any time. Articles that did not make the list are dropped when the run
 * ends. Each run also writes one ingestion_runs row (counts and cost, which the
 * budget sums) and, when the agent runs, one agent_runs row.
 *
 * A run that is over budget, fails, or finds no usable articles leaves the
 * previous list in place. The API hides stories older than 24 hours, so a list
 * that stops updating empties on its own rather than showing old news.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { pickTopStories, type PickerClient, type TopStory } from '../../agents/top-stories.js';
import { NewsSearchError, type NewsSearchClient } from './apify-client.js';
import { loadSpend, planRun, type BudgetLimits, type RunPlan } from './budget.js';
import { normalizeItems } from './normalize.js';
import { buildNewsQueries, NEWS_QUERY_VERSION, plainQuery } from './queries.js';
import { groupStories } from './stories.js';

export const NEWS_SOURCE_KEY = 'apify-google-news';
export const AGENT_RUN_RETENTION_DAYS = 30;
const MAX_ALSO_COVERED = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewsSyncOptions {
  search: NewsSearchClient;
  picker: PickerClient | null;
  pickerModel: string;
  limit: number;
  resultsPerQuery: number;
  pricePer1000Usd: number;
  budget: BudgetLimits;
  now?: Date;
  /** Tests use their own source so they never touch real rows. */
  sourceKey?: string;
  log?: (message: string) => void;
}

export interface NewsSyncStats {
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  ingestionRunId: string;
  reason?: string;
  fetched: number;
  accepted: number;
  rejected: number;
  candidates: number;
  stories: number;
  method: 'AI' | 'RANKED' | null;
  costUsd: number;
}

export async function ensureNewsSource(db: PrismaClient, sourceKey = NEWS_SOURCE_KEY) {
  // Insert-if-absent rather than upsert, so two runs starting together cannot race on the key.
  await db.dataSource.createMany({
    skipDuplicates: true,
    data: {
      key: sourceKey,
      name: 'Google News search via Apify',
      type: 'OTHER',
      authority: 'Each article\'s publisher',
      homepageUrl: 'https://news.google.com',
      attributionText: 'Headlines and links from each publisher, found through Google News search. Stories selected by VoteInformed.',
      coverageDescription: 'U.S. political news from the past 24 hours. Only the published top stories are stored; article text is never fetched.',
      expectedCadenceSeconds: 2 * 60 * 60,
      isEnabled: true,
    },
  });
  return db.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
}

/** The row for one picked story: the lead article, plus the other outlets that ran it. */
export function storyRow(top: TopStory, rank: number, ingestionRunId: string, agentRunId: string | null, method: 'AI' | 'RANKED'): Prisma.NewsStoryCreateManyInput {
  const lead = top.story.lead;
  const others = [...top.story.articles.slice(1), ...top.related.flatMap((story) => story.articles)]
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const domains = new Set([lead.outletDomain]);
  const alsoCoveredBy: Array<{ outlet: string; url: string }> = [];
  for (const article of others) {
    if (domains.has(article.outletDomain)) continue;
    domains.add(article.outletDomain);
    if (alsoCoveredBy.length < MAX_ALSO_COVERED) alsoCoveredBy.push({ outlet: article.outlet, url: article.url });
  }
  return {
    rank,
    headline: lead.headline,
    snippet: lead.snippet,
    outlet: lead.outlet,
    outletDomain: lead.outletDomain,
    url: lead.url,
    publishedAt: lead.publishedAt,
    topic: top.topic,
    stateCode: top.stateCode,
    outletCount: domains.size,
    alsoCoveredBy,
    selectedBy: method,
    ingestionRunId,
    agentRunId,
  };
}

export async function syncNews(db: PrismaClient, options: NewsSyncOptions): Promise<NewsSyncStats> {
  const { search, picker, pickerModel, limit, resultsPerQuery, pricePer1000Usd, budget, now = new Date(), sourceKey = NEWS_SOURCE_KEY, log = console.log } = options;
  const source = await ensureNewsSource(db, sourceKey);
  await db.dataSource.update({ where: { id: source.id }, data: { lastCheckedAt: now } });

  const queries = buildNewsQueries(now);
  const spend = await loadSpend(db, source.id, now);
  const plan: RunPlan = planRun({ wantedItems: queries.length * resultsPerQuery, pricePer1000Usd, limits: budget, spend });
  const baseMetadata = {
    queryVersion: NEWS_QUERY_VERSION,
    queries: queries.map(plainQuery),
    actorId: search.actorId,
    plan: { maxItems: plan.maxItems, maxChargeUsd: plan.maxChargeUsd, estimateUsd: plan.estimateUsd },
    spendBefore: { last24hUsd: spend.last24hUsd, totalUsd: spend.totalUsd },
  };
  const run = await db.ingestionRun.create({
    data: { sourceId: source.id, status: 'RUNNING', parserVersion: NEWS_QUERY_VERSION, startedAt: now, metadata: baseMetadata },
  });
  const empty = { fetched: 0, accepted: 0, rejected: 0, candidates: 0, stories: 0, method: null, costUsd: 0 } as const;

  if (!plan.ok) {
    log(`📰 News run skipped: ${plan.reason}`);
    await db.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED', completedAt: new Date(), errorSummary: plan.reason, metadata: { ...baseMetadata, costUsd: 0 } },
    });
    return { status: 'SKIPPED', ingestionRunId: run.id, reason: plan.reason, ...empty };
  }

  let costUsd = 0;
  try {
    log(`📰 Searching ${queries.length} queries, up to ${plan.maxItems} results (cap $${plan.maxChargeUsd.toFixed(2)})`);
    const maxItemsPerQuery = Math.max(1, Math.floor(plan.maxItems / queries.length));
    const result = await search.search({ queries, maxItemsPerQuery, maxItems: plan.maxItems, maxChargeUsd: plan.maxChargeUsd });
    const costEstimated = result.costUsd === null;
    costUsd = result.costUsd ?? Math.round(result.items.length * pricePer1000Usd * 10) / 10_000;

    const { articles, rejected } = normalizeItems(result.items, { now });
    const rejectedCount = Object.values(rejected).reduce((total, count) => total + (count ?? 0), 0);
    const candidates = groupStories(articles);
    log(`  ${result.items.length} results, ${articles.length} usable articles, ${candidates.length} stories, $${costUsd.toFixed(4)}`);
    const metadata = {
      ...baseMetadata,
      apifyRunId: result.runId,
      apifyStatus: result.status,
      costUsd,
      costEstimated,
      rejected: rejected as Record<string, number>,
      candidates: candidates.length,
    };

    if (articles.length === 0) {
      const reason = 'No usable articles from the past 24 hours; the previous list stays up';
      await db.ingestionRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', completedAt: new Date(), recordsFetched: result.items.length, recordsRejected: rejectedCount, errorSummary: reason, metadata },
      });
      await db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'DEGRADED' } });
      return { status: 'FAILED', ingestionRunId: run.id, reason, ...empty, fetched: result.items.length, rejected: rejectedCount, costUsd };
    }

    const picked = await pickTopStories(db, candidates, { client: picker, model: pickerModel, limit, now, log });
    const rows = picked.stories.map((top, index) => storyRow(top, index + 1, run.id, picked.agentRunId, picked.method));
    // Swap the whole list at once, so readers never see half of the old and half of the new.
    await db.$transaction([
      db.newsStory.deleteMany({ where: { ingestionRun: { sourceId: source.id } } }),
      db.newsStory.createMany({ data: rows }),
      db.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          recordsFetched: result.items.length,
          recordsAccepted: rows.length,
          recordsRejected: rejectedCount,
          metadata: {
            ...metadata,
            method: picked.method,
            fallbackReason: picked.fallbackReason ?? null,
            agentRunId: picked.agentRunId,
            reusedAgentOutput: picked.reusedOutput,
            droppedIds: picked.droppedIds,
            stories: rows.length,
          },
        },
      }),
      db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'CURRENT', lastSuccessfulAt: new Date() } }),
    ]);
    await pruneAgentRuns(db, now);
    log(`✅ ${rows.length} top stories published (${picked.method === 'AI' ? 'picked by the agent' : 'ranked by coverage'})`);
    return {
      status: 'SUCCEEDED',
      ingestionRunId: run.id,
      fetched: result.items.length,
      accepted: articles.length,
      rejected: rejectedCount,
      candidates: candidates.length,
      stories: rows.length,
      method: picked.method,
      costUsd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A run that started on Apify may have been charged; count its cap so the budget stays safe.
    if (costUsd === 0 && error instanceof NewsSearchError && error.runId) costUsd = plan.maxChargeUsd;
    await db.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorSummary: message.slice(0, 2000),
        metadata: { ...baseMetadata, costUsd, costEstimated: true, apifyRunId: error instanceof NewsSearchError ? error.runId ?? null : null },
      },
    });
    await db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'DEGRADED' } });
    log(`❌ News run failed: ${message}`);
    return { status: 'FAILED', ingestionRunId: run.id, reason: message, ...empty, costUsd };
  }
}

/** Top-stories agent runs are only needed for tracing recent lists. */
export async function pruneAgentRuns(db: PrismaClient, now: Date = new Date()): Promise<number> {
  const result = await db.agentRun.deleteMany({
    where: { agent: 'TOP_STORIES', createdAt: { lt: new Date(now.getTime() - AGENT_RUN_RETENTION_DAYS * DAY_MS) } },
  });
  return result.count;
}
