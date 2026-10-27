/**
 * One pass of the news job under its own lease, shared by the CLI, the cron-news
 * service, and the in-process schedule: run Apify if a run is due, then, when the
 * agent is on, let the top stories agent re-rank the trending stories.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { ApifyClient } from './apify-client.js';
import type { BudgetLimits } from './budget.js';
import { ITEMS_PER_FEED } from './feeds.js';
import { NEWS_SOURCE_KEY, syncNews, type NewsSyncStats } from './news-sync.js';
import { isNewsRunDue, newsIntervalMinutes } from './schedule.js';
import { runTopStoriesAgent, type TopStoriesAgentResult } from './top-stories-agent.js';
import { anthropicPicker } from './top-stories-model.js';

export const NEWS_LEASE = 'news';
const LEASE_MS = 20 * 60 * 1000;
/** About 10 feeds of 20 articles. */
export const MAX_ITEMS_PER_RUN = 10 * ITEMS_PER_FEED;

export interface NewsCycleOptions {
  /** Run even if the last run was too recent. */
  force?: boolean;
  /** Override APIFY_NEWS_ACTOR_ID, for the actor bake-off. */
  actorId?: string;
  /** Skip Apify and run only the top stories agent, now. */
  agentOnly?: boolean;
  log?: (message: string) => void;
}

export interface NewsCycleResult {
  ingest: NewsSyncStats | { status: 'NOT_DUE'; nextInMinutes: number } | { status: 'NOT_RUN' };
  agent: TopStoriesAgentResult | { status: 'OFF'; reason: string };
}

async function runAgent(force: boolean, log: (message: string) => void): Promise<NewsCycleResult['agent']> {
  if (!env.NEWS_AGENTS_ENABLED) return { status: 'OFF', reason: 'NEWS_AGENTS_ENABLED is off' };
  if (!env.ANTHROPIC_API_KEY) return { status: 'OFF', reason: 'ANTHROPIC_API_KEY is not set' };
  try {
    return await runTopStoriesAgent(prisma, anthropicPicker(env.ANTHROPIC_API_KEY, env.NEWS_PICKER_MODEL), { modelName: env.NEWS_PICKER_MODEL, force, log });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`❌ Top stories agent failed: ${reason}`);
    return { status: 'FAILED', reason };
  }
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
  const { force = false, agentOnly = false, log = console.log } = options;
  const actorId = options.actorId ?? env.APIFY_NEWS_ACTOR_ID;
  if (!agentOnly && !env.APIFY_TOKEN) throw new Error('APIFY_TOKEN is not configured; the news job is unavailable');
  if (!agentOnly && !actorId) throw new Error('APIFY_NEWS_ACTOR_ID is not configured; pick an actor with the bake-off in docs/plans/news-agents.md');

  const token = await acquireSyncLease(NEWS_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    if (agentOnly) return { ingest: { status: 'NOT_RUN' }, agent: await runAgent(true, log) };
    const now = new Date();
    const last = await prisma.ingestionRun.findFirst({
      where: { source: { key: NEWS_SOURCE_KEY } },
      orderBy: { createdAt: 'desc' },
      select: { startedAt: true, createdAt: true },
    });
    const lastStartedAt = last ? last.startedAt ?? last.createdAt : null;
    if (!force && !isNewsRunDue(lastStartedAt, now)) {
      const nextInMinutes = Math.ceil(newsIntervalMinutes(now) - (now.getTime() - lastStartedAt!.getTime()) / 60_000);
      return { ingest: { status: 'NOT_DUE', nextInMinutes }, agent: { status: 'OFF', reason: 'no new articles this pass' } };
    }
    const client = new ApifyClient({ token: env.APIFY_TOKEN!, baseUrl: env.APIFY_API_BASE_URL });
    const ingest = await syncNews(prisma, client, { actorId: actorId!, limits: newsBudgetLimits(), electionTopicIds: env.NEWS_ELECTION_TOPIC_IDS, now, log });
    // The agent re-judges only when new articles arrived; its own interval rules apply.
    const agent = ingest.status === 'SUCCEEDED' || ingest.status === 'PARTIAL'
      ? await runAgent(false, log)
      : { status: 'OFF' as const, reason: `the news run ${ingest.status.toLowerCase()}` };
    return { ingest, agent };
  } finally {
    await releaseSyncLease(NEWS_LEASE, token);
  }
}
