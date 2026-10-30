#!/usr/bin/env tsx
/**
 * Load 2026 Senate and House polls from VoteHub. See src/services/polls/.
 *
 * Needs egress to api.votehub.com, a reachable DATABASE_URL (to read
 * candidates), and POLLS_DATABASE_URL (where polls are written). VoteHub needs
 * no key. A run makes about three requests, one second apart.
 *
 * Usage:
 *   npm run sync:polls
 *   node dist/scripts/sync-polls.js   # Railway cron
 */

import { prisma } from '../config/database.js';
import { getPollsDb } from '../config/polls-database.js';
import { PollsNotConfiguredError, runPollSync } from '../services/polls/run-poll-sync.js';

async function disconnect(): Promise<void> {
  await Promise.all([prisma.$disconnect(), getPollsDb()?.$disconnect()]);
}

async function main(): Promise<void> {
  console.log('🗳️  Syncing VoteHub polls');
  try {
    const stats = await runPollSync();
    const icon = stats.status === 'SUCCEEDED' ? '✅' : stats.status === 'PARTIAL' ? '⚠️ ' : '❌';
    console.log(
      `${icon} Poll sync ${stats.status}: ${stats.fetched} fetched, ${stats.inserted} new, ${stats.updated} changed, `
      + `${stats.needsReview} waiting for review, ${stats.skipped} skipped, ${stats.removed} removed from VoteHub`,
    );
    await disconnect();
    process.exit(stats.status === 'FAILED' ? 1 : 0);
  } catch (error) {
    if (error instanceof PollsNotConfiguredError) console.error(`❌ ${error.message}. On Railway, add a Postgres service for polls and reference its DATABASE_URL.`);
    else console.error('❌ Poll sync failed:', error instanceof Error ? error.message : error);
    await disconnect();
    process.exit(1);
  }
}

main();
