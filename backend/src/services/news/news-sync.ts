/**
 * One news run: check the budget, run the Apify actor over the feed plan, normalize
 * the articles, and store them. Every run, skipped ones included, is an ingestion_runs
 * row whose metadata records the actor, the Apify run, the feeds, and what it cost.
 *
 * Article text is never fetched or stored (docs/plans/news-agents.md). The Apify run
 * ID and dataset ID are kept in place of a RawArtifact, whose storage is still the
 * local filesystem that a Railway redeploy wipes; Apify keeps the dataset itself.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { adapterFor } from './apify-actors.js';
import type { ApifyClient } from './apify-client.js';
import { loadSpend, planRunBudget, runCostUsd, type BudgetLimits } from './budget.js';
import { buildFeedPlan, feedCount, NEWS_QUERY_VERSION } from './feeds.js';
import { mergeBatch, storeArticles } from './news-store.js';
import { normalizeItem, type Rejection } from './normalize.js';

export const NEWS_SOURCE_KEY = 'apify-google-news';

export interface NewsSyncOptions {
  actorId: string;
  limits: BudgetLimits;
  electionTopicIds?: readonly string[];
  /** Tests use their own source so they never touch real rows. */
  sourceKey?: string;
  now?: Date;
  log?: (message: string) => void;
}

export interface NewsSyncStats {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  reason?: string;
  ingestionRunId: string;
  apifyRunId?: string;
  fetched: number;
  inserted: number;
  updated: number;
  rejected: Partial<Record<Rejection, number>>;
  costUsd: number;
}

export async function ensureNewsSource(db: PrismaClient, sourceKey: string, now: Date) {
  await db.dataSource.createMany({
    skipDuplicates: true,
    data: {
      key: sourceKey,
      name: 'Google News, through Apify',
      type: 'OTHER',
      authority: 'Google News feeds, collected by an Apify actor',
      homepageUrl: 'https://news.google.com',
      attributionText: 'Headlines from Google News, collected through Apify. Every story links to its publisher.',
      coverageDescription: 'US top stories, the U.S. section, and national election searches: headline, outlet, link, and publish time only.',
      expectedCadenceSeconds: 2 * 60 * 60,
      isEnabled: true,
    },
  });
  return db.dataSource.update({ where: { key: sourceKey }, data: { lastCheckedAt: now } });
}

export async function syncNews(db: PrismaClient, client: Pick<ApifyClient, 'runActor'>, options: NewsSyncOptions): Promise<NewsSyncStats> {
  const { actorId, limits, electionTopicIds = [], sourceKey = NEWS_SOURCE_KEY, now = new Date(), log = console.log } = options;
  const adapter = adapterFor(actorId);
  const source = await ensureNewsSource(db, sourceKey, now);
  const parserVersion = `${NEWS_QUERY_VERSION}/${adapter.id}`;

  const budget = planRunBudget(limits, await loadSpend(db, sourceKey, now));
  if (!budget.ok) {
    const skipped = await db.ingestionRun.create({
      data: { sourceId: source.id, status: 'CANCELLED', parserVersion, startedAt: now, completedAt: now, errorSummary: budget.reason, metadata: { skipped: budget.reason, costUsd: 0 } },
    });
    log(`📰 News run skipped: ${budget.reason}`);
    return { status: 'SKIPPED', reason: budget.reason, ingestionRunId: skipped.id, fetched: 0, inserted: 0, updated: 0, rejected: {}, costUsd: 0 };
  }

  const plan = buildFeedPlan(now, electionTopicIds);
  const input = adapter.buildInput(plan, budget.maxItems);
  const baseMetadata = { actorId: adapter.id, queryVersion: NEWS_QUERY_VERSION, feeds: feedCount(plan), queries: plan.queries, maxItems: budget.maxItems, maxChargeUsd: budget.maxChargeUsd };
  const run = await db.ingestionRun.create({
    data: { sourceId: source.id, status: 'RUNNING', parserVersion, startedAt: now, metadata: baseMetadata },
  });

  let result;
  try {
    result = await client.runActor(adapter.id, input, { maxItems: budget.maxItems, maxChargeUsd: budget.maxChargeUsd });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The run may have started and charged before the error, so count the most it could have cost.
    const costUsd = runCostUsd(budget.maxItems, limits.pricePer1000Usd, null);
    await db.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', completedAt: new Date(), errorSummary: message.slice(0, 2000), metadata: { ...baseMetadata, costUsd, costIsUpperBound: true } },
    });
    await db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'DEGRADED' } });
    log(`❌ News run failed: ${message}`);
    return { status: 'FAILED', reason: message, ingestionRunId: run.id, fetched: 0, inserted: 0, updated: 0, rejected: {}, costUsd };
  }

  const rejected: Partial<Record<Rejection, number>> = {};
  const accepted = [];
  for (const item of adapter.parseItems(result.items, plan)) {
    const normalized = normalizeItem(item, now);
    if (normalized.ok) accepted.push(normalized.article);
    else rejected[normalized.rejection] = (rejected[normalized.rejection] ?? 0) + 1;
  }
  const merged = mergeBatch(accepted);
  const { inserted, updated } = await storeArticles(db, source.id, run.id, merged, now);
  const costUsd = runCostUsd(result.items.length, limits.pricePer1000Usd, result.run.usageTotalUsd);
  const status: NewsSyncStats['status'] = result.run.status === 'SUCCEEDED' && !result.aborted
    ? 'SUCCEEDED'
    : result.items.length > 0 ? 'PARTIAL' : 'FAILED';
  const rejectedCount = Object.values(rejected).reduce((total, count) => total + (count ?? 0), 0);
  await db.ingestionRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt: new Date(),
      recordsFetched: result.items.length,
      recordsAccepted: inserted + updated,
      recordsRejected: rejectedCount,
      errorSummary: status === 'SUCCEEDED' ? null : `Apify run ended ${result.run.status}${result.aborted ? ' after being aborted' : ''}`,
      metadata: {
        ...baseMetadata,
        apifyRunId: result.run.id,
        apifyStatus: result.run.status,
        datasetId: result.run.defaultDatasetId,
        usageTotalUsd: result.run.usageTotalUsd,
        costUsd,
        rejected,
      } as Prisma.InputJsonValue,
    },
  });
  await db.dataSource.update({
    where: { id: source.id },
    data: status === 'SUCCEEDED' ? { healthStatus: 'CURRENT', lastSuccessfulAt: new Date() } : { healthStatus: 'DEGRADED' },
  });
  log(`📰 News run ${status}: ${result.items.length} fetched, ${inserted} new, ${updated} seen again, ${rejectedCount} dropped, $${costUsd.toFixed(2)}`);
  return { status, ingestionRunId: run.id, apifyRunId: result.run.id, fetched: result.items.length, inserted, updated, rejected, costUsd };
}
