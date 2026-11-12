/**
 * `npm run check:finals -- --state WV`: our race-level totals for a state, from the database, to compare with the
 * state's official results page (#136, docs/plans/lock-2026-record.md, "Check and record"). Reads only.
 */
import { prisma } from '../config/database.js';
import { stateTotals } from '../features/election-results/certification.js';

const index = process.argv.indexOf('--state');
const state = index >= 0 ? process.argv[index + 1] : undefined;
if (!state) {
  console.error('Usage: npm run check:finals -- --state WV');
  process.exit(2);
}
const number = new Intl.NumberFormat('en-US');
for (const race of await stateTotals(prisma, state)) {
  const changed = race.lastChangedAt ? ` · count last changed ${race.lastChangedAt.slice(0, 10)}` : '';
  console.log(`\n${race.race} · ${race.totalVotes === null ? 'no total' : `${number.format(race.totalVotes)} votes`} · ${race.counties} counties${changed}`);
  for (const candidate of race.candidates) console.log(`  ${candidate.name} (${candidate.party ?? 'no party'}): ${number.format(candidate.votes)}`);
  for (const row of race.rankedChoice) console.log(`  ranked-choice round ${row.round}: ${row.candidacyId} ${number.format(row.votes)}${row.isWinner ? ' (winner)' : ''}`);
}
await prisma.$disconnect();
