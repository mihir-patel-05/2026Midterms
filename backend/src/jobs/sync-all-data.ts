#!/usr/bin/env tsx
/**
 * Run the full FEC sync once from the command line. Uses the same code path
 * and sync lease as the scheduler, so it can never overlap a scheduled run.
 *
 * Usage:
 *   npm run sync:dev   (or: npm run sync:all after a build)
 */

import { prisma } from '../config/database.js';
import { runScheduledSync } from './scheduler.js';

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
    await runScheduledSync();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync job failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
