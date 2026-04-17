#!/usr/bin/env tsx
/**
 * Lightweight test for simulation.service without pulling in a test framework.
 * Run with: npx tsx src/scripts/test-simulation.ts
 *
 * Fixture: one House race in CA-01 across two counties.
 *   - County A (big): 60% D, 38% R, 2% Other, 100k votes
 *   - County B (small): 45% D, 53% R, 2% Other, 10k votes
 * Baseline: D wins by roughly +17pp.
 * Apply a -10pp D swing / +10pp R swing → race should flip to R.
 */

import { simulateFromRows, type CountyResultRow } from '../services/simulation.service.js';

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  } else {
    console.log('✅', msg);
  }
}

function rows(
  state: string,
  district: string,
  county: string,
  totals: Record<string, number>,
): CountyResultRow[] {
  return Object.entries(totals).map(([party, votes]) => ({
    state,
    officeType: 'HOUSE',
    district,
    countyFips: county,
    party,
    votes,
  }));
}

const fixture: CountyResultRow[] = [
  ...rows('CA', '01', '06001', { DEMOCRAT: 60_000, REPUBLICAN: 38_000, OTHER: 2_000 }),
  ...rows('CA', '01', '06002', { DEMOCRAT: 4_500, REPUBLICAN: 5_300, OTHER: 200 }),
];

// Baseline: no swing
const baseline = simulateFromRows(fixture, {});
assert(baseline.races.length === 1, 'single race in baseline');
assert(baseline.races[0].baselineWinner === 'D', 'Democrat wins baseline');
assert(baseline.races[0].flipped === false, 'not flipped in baseline');
assert(Math.abs(baseline.races[0].simulatedMargin - baseline.races[0].baselineMargin) < 0.001, 'no swing → sim margin equals baseline');

// Apply big swing: -10 D, +10 R
const swung = simulateFromRows(fixture, { statewide: { D: -10, R: 10 } });
assert(swung.races[0].baselineWinner === 'D', 'baseline still D');
assert(swung.races[0].simulatedWinner === 'R', 'R wins after swing');
assert(swung.races[0].flipped === true, 'race is marked flipped');
assert(swung.flippedSeats.R === 1, 'one R pickup');
assert(swung.flippedSeats.D === 0, 'zero D pickups');

// Smaller swing: should not flip
const nudge = simulateFromRows(fixture, { statewide: { D: -5, R: 5 } });
assert(nudge.races[0].simulatedWinner === 'D', 'small swing does not flip');
assert(nudge.races[0].flipped === false, 'not flipped');

// Per-race override beats statewide
const override = simulateFromRows(fixture, {
  statewide: { D: 0, R: 0 },
  perRace: { 'CA-HOUSE-01': { D: -15, R: 15 } },
});
assert(override.races[0].simulatedWinner === 'R', 'per-race override applies');

console.log('\nAll simulation tests passed.');
