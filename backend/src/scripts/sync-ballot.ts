#!/usr/bin/env tsx
/**
 * Load the 2026 general election ballot for every House and Senate race from civicAPI.
 * See src/services/ballot/.
 *
 * Needs egress to civicapi.org and a reachable DATABASE_URL. Without --apply it only
 * reports what it would write: run that first after any civicAPI change.
 *
 * Usage:
 *   npm run sync:ballot              # dry run
 *   npm run sync:ballot -- --apply
 *   node dist/scripts/sync-ballot.js --apply   # Railway
 */

import { prisma } from '../config/database.js';
import { runBallotSync } from '../services/ballot/run-ballot-sync.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  try {
    const report = await runBallotSync({ apply });
    if (!apply) console.log('ℹ️  Dry run: nothing was written. Rerun with --apply to write the ballot.');
    await prisma.$disconnect();
    process.exit(report.races > 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ Ballot sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void main();
