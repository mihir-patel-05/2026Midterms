#!/usr/bin/env tsx
/**
 * Run the news job once. See src/services/news/ and docs/plans/news-agents.md.
 *
 * Needs APIFY_TOKEN, APIFY_NEWS_ACTOR_ID (or --actor), and a reachable DATABASE_URL.
 * A run reads US top stories, the U.S. section, and national election searches in
 * one Apify actor run, within the spend caps.
 *
 * Usage:
 *   npm run sync:news                     # run if one is due
 *   npm run sync:news -- --force          # run now
 *   npm run sync:news -- --actor=cirkit/google-news-scraper --force   # bake-off
 *   npm run sync:news -- --dry-run        # print the actor input and budget, call nothing
 *   npm run sync:news -- --agent          # skip Apify; run the top stories agent now
 *   node dist/scripts/sync-news.js        # cron-news Railway service, every 30 minutes
 */

import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { ACTOR_ADAPTERS, adapterFor } from '../services/news/apify-actors.js';
import { loadSpend, planRunBudget } from '../services/news/budget.js';
import { buildFeedPlan } from '../services/news/feeds.js';
import { NEWS_SOURCE_KEY } from '../services/news/news-sync.js';
import { newsBudgetLimits, runNewsCycle } from '../services/news/run-news-cycle.js';
import { SyncAlreadyRunningError } from '../services/sync-lock.service.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

async function dryRun(actorId: string): Promise<void> {
  const now = new Date();
  const budget = planRunBudget(newsBudgetLimits(), await loadSpend(prisma, NEWS_SOURCE_KEY, now));
  const plan = buildFeedPlan(now, env.NEWS_ELECTION_TOPIC_IDS);
  console.log('Budget:', budget);
  console.log(`Input for ${actorId}:`);
  console.log(JSON.stringify(adapterFor(actorId).buildInput(plan, budget.ok ? budget.maxItems : 0), null, 2));
}

async function main(): Promise<number> {
  const actorId = value('actor') ?? env.APIFY_NEWS_ACTOR_ID;
  if (flag('agent')) {
    try {
      const { agent } = await runNewsCycle({ agentOnly: true });
      console.log('🤖 Top stories agent:', agent);
      return agent.status === 'FAILED' ? 1 : 0;
    } catch (error) {
      console.error('❌ Top stories agent failed:', error instanceof Error ? error.message : error);
      return 1;
    }
  }
  if (!actorId) {
    console.error(`❌ Set APIFY_NEWS_ACTOR_ID or pass --actor=. Supported: ${Object.keys(ACTOR_ADAPTERS).join(', ')}`);
    return 1;
  }
  if (flag('dry-run')) {
    await dryRun(actorId);
    return 0;
  }
  if (!env.APIFY_TOKEN) {
    console.error('❌ APIFY_TOKEN is not set. Copy the API token from the Apify console (Settings > Integrations) to the Backend service.');
    return 1;
  }
  try {
    const { ingest, agent } = await runNewsCycle({ force: flag('force'), actorId });
    if (ingest.status === 'NOT_DUE') {
      console.log(`📰 No news run due; the next one is in about ${ingest.nextInMinutes} minutes. Pass --force to run now.`);
      return 0;
    }
    if (agent.status === 'OFF') console.log(`🤖 Top stories agent not run: ${agent.reason}`);
    return ingest.status === 'FAILED' ? 1 : 0;
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      console.log('📰 Another news run holds the lease; skipping.');
      return 0;
    }
    console.error('❌ News run failed:', error instanceof Error ? error.message : error);
    return 1;
  }
}

main().then(async (code) => {
  await prisma.$disconnect();
  process.exit(code);
});
