#!/usr/bin/env tsx
/**
 * Load EIA weekly gasoline and diesel prices (PLAN.md §4.8). Needs egress to api.eia.gov,
 * DATABASE_URL, and EIA_API_KEY (free). About 20 requests.
 *
 *   npm run sync:fuel
 *   node dist/scripts/sync-fuel.js   # Railway cron
 */
import { prisma } from '../config/database.js';
import { FUEL_SERIES } from '../services/fuel/fuel-catalog.js';
import { runFuelSync } from '../services/fuel/run-fuel-sync.js';

async function main() {
  console.log(`⛽ Syncing ${FUEL_SERIES.length} EIA fuel price series`);
  try {
    const stats = await runFuelSync();
    console.log(`✅ Fuel sync ${stats.status}: ${stats.inserted} new weeks, ${stats.updated} revised${stats.failures.length ? `; failed: ${stats.failures.map((item) => `${item.eiaId} (${item.error})`).join('; ')}` : ''}`);
    await prisma.$disconnect();
    process.exit(stats.status === 'FAILED' ? 1 : 0);
  } catch (error) {
    console.error('❌ Fuel sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
