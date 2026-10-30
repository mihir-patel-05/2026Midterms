/**
 * One news run under its own lease, shared by the CLI and the schedule.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AnthropicPickerClient } from '../../agents/top-stories.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { ApifyNewsClient, parseInputOverrides } from './apify-client.js';
import { syncNews, type NewsSyncStats } from './news-sync.js';

export const NEWS_LEASE = 'news';
// The Apify run waits up to 10 minutes; the lease outlasts it.
const LEASE_MS = 20 * 60 * 1000;

/** Why a run cannot start with the current settings, or null when it can. */
export function newsConfigProblem(): string | null {
  if (!env.APIFY_TOKEN) return 'APIFY_TOKEN is not set';
  if (!env.APIFY_NEWS_ACTOR_ID) return 'APIFY_NEWS_ACTOR_ID is not set (pick the actor with the bake-off in docs/plans/news-agents.md)';
  return null;
}

export function newsSyncSettings() {
  return {
    pickerModel: env.NEWS_PICKER_MODEL,
    limit: env.NEWS_TOP_STORIES_LIMIT,
    resultsPerQuery: env.NEWS_RESULTS_PER_QUERY,
    pricePer1000Usd: env.APIFY_PRICE_PER_1000_USD,
    budget: { dailyUsd: env.NEWS_DAILY_BUDGET_USD, totalUsd: env.NEWS_TOTAL_BUDGET_USD },
  };
}

/** Run to completion. Throws SyncAlreadyRunningError if a run is already going. */
export async function runNewsSync(log: (message: string) => void = console.log): Promise<NewsSyncStats> {
  const problem = newsConfigProblem();
  if (problem) throw new Error(`News sync is unavailable: ${problem}`);
  const token = await acquireSyncLease(NEWS_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const search = new ApifyNewsClient({
      token: env.APIFY_TOKEN!,
      actorId: env.APIFY_NEWS_ACTOR_ID!,
      inputOverrides: parseInputOverrides(env.APIFY_NEWS_INPUT_JSON),
    });
    const picker = env.NEWS_AGENTS_ENABLED && env.ANTHROPIC_API_KEY ? new AnthropicPickerClient(env.ANTHROPIC_API_KEY) : null;
    return await syncNews(prisma, { search, picker, ...newsSyncSettings(), log });
  } finally {
    await releaseSyncLease(NEWS_LEASE, token);
  }
}
