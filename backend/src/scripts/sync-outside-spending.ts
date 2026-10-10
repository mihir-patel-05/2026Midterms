#!/usr/bin/env tsx
/**
 * Sync FEC Schedule E outside spending (independent expenditures).
 * Re-fetches the recent window and continues the historical backfill, within
 * SCHEDULE_E_MAX_PAGES OpenFEC pages. Run it again to continue a large backfill.
 *
 * Usage:
 *   npm run sync:outside-spending                 # 2026 cycle
 *   npm run sync:outside-spending -- --cycle 2026
 *   node dist/scripts/sync-outside-spending.js    # inside the Railway container
 */
import { prisma } from '../config/database.js';
import { runScheduleESync } from '../services/outside-spending/run-schedule-e-sync.js';

function parseCycleArg(): number {
  const idx = process.argv.indexOf('--cycle');
  const parsed = idx !== -1 ? parseInt(process.argv[idx + 1] ?? '', 10) : NaN;
  return Number.isFinite(parsed) && parsed % 2 === 0 ? parsed : 2026;
}

async function main(): Promise<void> {
  const cycle = parseCycleArg();
  console.log(`💸 Syncing outside spending (Schedule E), ${cycle} cycle`);
  try {
    const stats = await runScheduleESync(cycle);
    console.log(`✅ Outside spending sync complete: ${JSON.stringify(stats)}`);
    if (!stats.backfill.complete) console.log('ℹ️  Backfill continues on the next run.');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Outside spending sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
