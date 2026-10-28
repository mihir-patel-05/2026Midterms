#!/usr/bin/env tsx
/**
 * Delete candidates who lost their primary, with their committees and itemized
 * receipts and disbursements, keeping only general election candidates. A dry
 * run by default: it lists, race by race, who is kept and who would go.
 *
 * Set NOMINEES_ONLY=true afterwards so the scheduled sync stops saving them again.
 *
 * Usage:
 *   npm run prune:primary-losers                       # dry run
 *   npm run prune:primary-losers -- --apply            # delete
 *   npm run prune:primary-losers -- --apply --ignore-date   # before the pre-general grace period ends
 *   node dist/scripts/prune-primary-losers.js --apply  # inside the Railway container
 */
import { prisma } from '../config/database.js';
import { fecApiService } from '../services/fec-api.service.js';
import { loadNomineeRoster, prunePrimaryLosers } from '../services/primary-pruning.service.js';

function parseCycleArg(): number {
  const idx = process.argv.indexOf('--cycle');
  const parsed = idx !== -1 ? parseInt(process.argv[idx + 1] ?? '', 10) : NaN;
  return Number.isFinite(parsed) && parsed % 2 === 0 ? parsed : 2026;
}

async function main(): Promise<void> {
  const cycle = parseCycleArg();
  const apply = process.argv.includes('--apply');
  const ignoreDate = process.argv.includes('--ignore-date');
  console.log(`🗳️  ${apply ? 'Pruning' : 'Dry run: pruning'} primary losers, ${cycle} cycle`);

  try {
    const committees = await fecApiService.getHouseSenateCommittees(cycle);
    const roster = await loadNomineeRoster(cycle, committees, { ignoreDate });
    if (!roster.ok) throw new Error(`Not pruning: ${roster.reason}`);
    console.log(`📋 ${roster.nominees.size} candidates filed a pre- or post-general report`);

    const result = await prunePrimaryLosers(cycle, roster.nominees, { apply });
    const byRace = new Map<string, { kept: string[]; dropped: string[] }>();
    for (const [list, key] of [[result.kept, 'kept'], [result.dropped, 'dropped']] as const) {
      for (const candidate of list) {
        const race = byRace.get(candidate.race) ?? { kept: [], dropped: [] };
        race[key].push(candidate.name);
        byRace.set(candidate.race, race);
      }
    }
    for (const [race, { kept, dropped }] of [...byRace].sort(([a], [b]) => a.localeCompare(b))) {
      if (dropped.length === 0) continue;
      console.log(`  ${race}: keep ${kept.join('; ') || '(none)'} | drop ${dropped.join('; ')}`);
    }

    const { deleted } = result;
    console.log(
      `\n${apply ? '✅ Deleted' : 'ℹ️  Would delete'} ${deleted.candidates} candidates in ${result.races} races, ` +
      `${deleted.committees} committees, ${deleted.receipts} receipts, ${deleted.disbursements} disbursements`,
    );
    if (!apply) console.log('ℹ️  Run again with --apply to delete.');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Pruning failed:', error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
