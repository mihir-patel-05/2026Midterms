#!/usr/bin/env tsx
/**
 * Load ACS 5-year demographics for the nation, states, counties, congressional
 * districts, and county pieces within districts. See src/services/census/.
 *
 * Needs egress to api.census.gov and a reachable DATABASE_URL. CENSUS_API_KEY is
 * optional; a full run makes about 300 requests.
 *
 * Usage:
 *   npm run sync:acs                 # CENSUS_ACS_YEAR, 2024 by default
 *   npm run sync:acs -- --year 2024
 */

import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { syncAcs } from '../services/census/acs-sync.js';
import { CensusClient } from '../services/census/census-client.js';

function parseYearArg(): number {
  const idx = process.argv.indexOf('--year');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = parseInt(process.argv[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 2020) return parsed;
    console.warn(`⚠️  Ignoring invalid --year value: ${process.argv[idx + 1]}`);
  }
  return env.CENSUS_ACS_YEAR;
}

async function main(): Promise<void> {
  const year = parseYearArg();
  if (!env.CENSUS_API_KEY) console.warn('⚠️  CENSUS_API_KEY is not set; using the keyless limit of 500 requests per day.');
  const client = new CensusClient({ apiKey: env.CENSUS_API_KEY, baseUrl: env.CENSUS_API_BASE_URL, year });
  console.log(`📊 Syncing ACS ${year} 5-year estimates`);
  try {
    const stats = await syncAcs(prisma, client, year);
    console.log(`✅ ACS ${year} sync complete:`, JSON.stringify(stats));
    await prisma.$disconnect();
    // Non-zero exit if nothing loaded, so a cron run surfaces a broken source.
    process.exit((stats.rows.COUNTY ?? 0) > 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ ACS sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
