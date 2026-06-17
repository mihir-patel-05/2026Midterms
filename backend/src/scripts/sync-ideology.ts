#!/usr/bin/env tsx
/**
 * Sync GovTrack-based ideology scores (issue #33).
 *
 * Populates the IdeologyScore table for sitting members so candidate profiles
 * can show the "Ideology Score" spectrum. See src/services/ideology.service.ts.
 *
 * Requires network egress to the GovTrack + congress-legislators hosts
 * (configurable via IDEOLOGY_GOVTRACK_BASE_URL / IDEOLOGY_LEGISLATORS_URL) and
 * a reachable DATABASE_URL.
 *
 * Usage:
 *   tsx src/scripts/sync-ideology.ts [--congress 119]
 *   npm run sync:ideology -- --congress 119
 */

import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { syncIdeologyScores } from '../services/ideology.service.js';

function parseCongressArg(): number {
  const idx = process.argv.indexOf('--congress');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = parseInt(process.argv[idx + 1], 10);
    if (Number.isFinite(parsed)) return parsed;
    console.warn(`⚠️  Ignoring invalid --congress value: ${process.argv[idx + 1]}`);
  }
  return env.IDEOLOGY_CONGRESS;
}

async function main(): Promise<void> {
  const congress = parseCongressArg();
  try {
    const stats = await syncIdeologyScores(congress);
    await prisma.$disconnect();
    // Non-zero exit if nothing was scored, so CI/cron surfaces a broken source.
    process.exit(stats.scored > 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ Ideology sync failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
