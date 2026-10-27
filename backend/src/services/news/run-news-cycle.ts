/**
 * One pass of the news job under its own lease, shared by the CLI, the cron-news
 * service, and the in-process schedule: run Apify if a run is due.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { ApifyClient } from './apify-client.js';
import type { BudgetLimits } from './budget.js';
import { ITEMS_PER_FEED } from './feeds.js';
import { NEWS_SOURCE_KEY, syncNews, type NewsSyncStats } from './news-sync.js';
import { isNewsRunDue, newsIntervalMinutes } from './schedule.js';

export const NEWS_LEASE = 'news';
const LEASE_MS = 20 * 60 * 1000;
/** About 10 feeds of 20 articles. */
export const MAX_ITEMS_PER_RUN = 10 * ITEMS_PER_FEED;

export interface NewsCycleOptions {
  /** Run even if the last run was too recent. */
  force?: boolean;
  /** Override APIFY_NEWS_ACTOR_ID, for the actor bake-off. */
  actorId?: string;
  log?: (message: string) => void;
}

export interface NewsCycleResult {
  ingest: NewsSyncStats | { status: 'NOT_DUE'; nextInMinutes: number };
}

export function newsBudgetLimits(): BudgetLimits {
  return {
    dailyUsd: env.NEWS_DAILY_BUDGET_USD,
    totalUsd: env.NEWS_TOTAL_BUDGET_USD,
    pricePer1000Usd: env.APIFY_PRICE_PER_1000_USD,
    maxItemsPerRun: MAX_ITEMS_PER_RUN,
  };
}

/** Throws SyncAlreadyRunningError if another pass holds the lease. */
export async function runNewsCycle(options: NewsCycleOptions = {}): Promise<NewsCycleResult> {
  const { force = false, log = console.log } = options;
  const actorId = options.actorId ?? env.APIFY_NEWS_ACTOR_ID;
  if (!env.APIFY_TOKEN) throw new Error('APIFY_TOKEN is not configured; the news job is unavailable');
  if (!actorId) throw new Error('APIFY_NEWS_ACTOR_ID is not configured; pick an actor with the bake-off in docs/plans/news-agents.md');

  const token = await acquireSyncLease(NEWS_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const now = new Date();
    const last = await prisma.ingestionRun.findFirst({
      where: { source: { key: NEWS_SOURCE_KEY } },
      orderBy: { createdAt: 'desc' },
      select: { startedAt: true, createdAt: true },
    });
    const lastStartedAt = last ? last.startedAt ?? last.createdAt : null;
    if (!force && !isNewsRunDue(lastStartedAt, now)) {
      const nextInMinutes = Math.ceil(newsIntervalMinutes(now) - (now.getTime() - lastStartedAt!.getTime()) / 60_000);
      return { ingest: { status: 'NOT_DUE', nextInMinutes } };
    }
    const client = new ApifyClient({ token: env.APIFY_TOKEN, baseUrl: env.APIFY_API_BASE_URL });
    const ingest = await syncNews(prisma, client, { actorId, limits: newsBudgetLimits(), electionTopicIds: env.NEWS_ELECTION_TOPIC_IDS, now, log });
    return { ingest };
  } finally {
    await releaseSyncLease(NEWS_LEASE, token);
  }
}
