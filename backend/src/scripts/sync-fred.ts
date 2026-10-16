#!/usr/bin/env tsx
/**
 * Load FRED economic indicators. See src/services/fred/.
 *
 * Needs egress to api.stlouisfed.org, a reachable DATABASE_URL, and FRED_API_KEY.
 * A run makes one request per series: about 22 national and 255 state series,
 * paced to about 100 a minute, so a run takes about 4 minutes.
 *
 * Usage:
 *   npm run sync:fred
 *   node dist/scripts/sync-fred.js   # Railway cron
 */

import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { runFredSync } from '../services/fred/run-fred-sync.js';
import { FRED_SERIES } from '../services/fred/series-catalog.js';

async function main(): Promise<void> {
  if (!env.FRED_API_KEY) {
    console.error('❌ FRED_API_KEY is not set. Get a free key at https://fredaccount.stlouisfed.org/apikeys and set it on the Backend service.');
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`📈 Syncing ${FRED_SERIES.length} FRED series`);
  try {
    const stats = await runFredSync();
    const inserted = stats.series.reduce((total, series) => total + series.inserted, 0);
    const updated = stats.series.reduce((total, series) => total + series.updated, 0);
    console.log(`✅ FRED sync ${stats.status}: ${inserted} new, ${updated} revised, ${stats.failures} series failed`);
    // A healthy re-run inserts almost nothing, so "loaded" means the run did not
    // fail and the shown series have data, not that this run wrote rows.
    const loaded = await prisma.indicatorSeries.count({
      where: { key: { in: FRED_SERIES.filter((def) => !def.restricted).map((def) => def.key) }, observations: { some: {} } },
    });
    await prisma.$disconnect();
    process.exit(stats.status !== 'FAILED' && loaded > 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ FRED sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
