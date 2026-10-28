#!/usr/bin/env tsx
/**
 * Refresh the top political stories of the past 24 hours. See src/services/news/.
 *
 * Needs NEWS_ENABLED=true, a reachable DATABASE_URL, APIFY_TOKEN, and APIFY_NEWS_ACTOR_ID. With
 * NEWS_AGENTS_ENABLED=true and ANTHROPIC_API_KEY, Agent 10 picks the stories;
 * otherwise they are ranked by how many outlets covered them.
 *
 * Usage:
 *   npm run sync:news
 *   npm run sync:news -- --dry-run   # print the queries and cost estimate; no Apify call
 *   node dist/scripts/sync-news.js   # Railway cron
 */

import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { loadSpend, planRun } from '../services/news/budget.js';
import { ensureNewsSource } from '../services/news/news-sync.js';
import { buildNewsQueries, plainQuery } from '../services/news/queries.js';
import { newsConfigProblem, newsSyncSettings, runNewsSync } from '../services/news/run-news-sync.js';
import { SyncAlreadyRunningError } from '../services/sync-lock.service.js';

async function dryRun(): Promise<void> {
  const settings = newsSyncSettings();
  const queries = buildNewsQueries();
  const source = await ensureNewsSource(prisma);
  const spend = await loadSpend(prisma, source.id);
  const plan = planRun({ wantedItems: queries.length * settings.resultsPerQuery, pricePer1000Usd: settings.pricePer1000Usd, limits: settings.budget, spend });
  console.log('📰 News dry run (no Apify call)');
  console.log(`  Actor: ${env.APIFY_NEWS_ACTOR_ID ?? '(not set)'}`);
  for (const query of queries) console.log(`  Query: ${plainQuery(query)} (past day)`);
  console.log(`  Spend: $${spend.last24hUsd.toFixed(2)} in the last 24 hours, $${spend.totalUsd.toFixed(2)} in total`);
  console.log(plan.ok
    ? `  Would request up to ${plan.maxItems} results, estimated $${plan.estimateUsd.toFixed(2)}, capped at $${plan.maxChargeUsd.toFixed(2)}`
    : `  Would skip: ${plan.reason}`);
  console.log(`  Picker: ${env.NEWS_AGENTS_ENABLED && env.ANTHROPIC_API_KEY ? settings.pickerModel : 'code ranking (agent off or no ANTHROPIC_API_KEY)'}, top ${settings.limit}`);
  const problem = newsConfigProblem();
  if (problem) console.log(`  ⚠️  A real run would fail: ${problem}`);
}

async function main(): Promise<void> {
  try {
    if (process.argv.includes('--dry-run')) {
      await dryRun();
      await prisma.$disconnect();
      process.exit(0);
    }
    if (!env.NEWS_ENABLED) {
      console.log('📰 NEWS_ENABLED is off; no news run. Set it to true on this service to turn news on.');
      await prisma.$disconnect();
      process.exit(0);
    }
    const stats = await runNewsSync();
    console.log(`📰 News run ${stats.status}: ${stats.stories} stories from ${stats.accepted} articles, $${stats.costUsd.toFixed(4)}${stats.reason ? ` (${stats.reason})` : ''}`);
    await prisma.$disconnect();
    // An over-budget skip is the budget working, not a failure.
    process.exit(stats.status === 'FAILED' ? 1 : 0);
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      console.log('📰 News run skipped: another run holds the lease');
      await prisma.$disconnect();
      process.exit(0);
    }
    console.error('❌ News run failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
