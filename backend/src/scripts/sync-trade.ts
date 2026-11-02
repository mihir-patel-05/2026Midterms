#!/usr/bin/env tsx
/**
 * Load each state's goods imports for one calendar year (all countries, and China + Mexico + Canada)
 * for the tariff exposure score. Needs egress to api.census.gov and DATABASE_URL; CENSUS_API_KEY is
 * recommended. Four requests.
 *
 *   npm run sync:trade             # the latest full year
 *   npm run sync:trade -- 2025     # a given year
 */
import { prisma } from '../config/database.js';
import { runTradeSync } from '../services/tariff/run-trade-sync.js';

async function main() {
  const year = process.argv[2] ? Number(process.argv[2]) : undefined;
  try {
    const stats = await runTradeSync(year);
    console.log(stats.status === 'SUCCEEDED' ? `✅ Census imports ${stats.year}: ${stats.states} states` : `❌ Census imports ${stats.year} failed: ${stats.error}`);
    await prisma.$disconnect();
    process.exit(stats.status === 'SUCCEEDED' ? 0 : 1);
  } catch (error) {
    console.error('❌ Census imports sync failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
