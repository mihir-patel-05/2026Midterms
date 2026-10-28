import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAverage, latestPerPollster, type AverageInputPoll } from './average.js';

const ASOF = '2026-10-28';
let next = 0;
const poll = (overrides: Partial<AverageInputPoll> & { d?: number; r?: number } = {}): AverageInputPoll => {
  const { d = 48, r = 46, ...rest } = overrides;
  return {
    id: `p${++next}`,
    pollster: 'Emerson',
    endDate: '2026-10-25',
    sampleSize: 1000,
    population: 'LV',
    isInternal: false,
    answers: [
      { choice: 'Brown', pct: d, party: 'DEM', candidateFecId: 'S6OH00001' },
      { choice: 'Husted', pct: r, party: 'REP', candidateFecId: 'S6OH00002' },
      { choice: 'Undecided', pct: 100 - d - r, party: null, candidateFecId: null },
    ],
    ...rest,
  };
};

test('no polls, only old polls, and a single pollster each have their own state', () => {
  assert.equal(computeAverage([], ASOF).status, 'none');

  const stale = computeAverage([poll({ endDate: '2026-09-01' })], ASOF);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.newestEndDate, '2026-09-01');
  assert.deepEqual(stale.candidates, []);

  // Two polls from one firm are still one pollster: shown, not averaged.
  const one = computeAverage([poll(), poll({ endDate: '2026-10-10' })], ASOF);
  assert.equal(one.status, 'too_few');
  assert.equal(one.pollsterCount, 1);
  assert.deepEqual(one.candidates, []);
  assert.equal(one.margin, null);
});

test('equal polls average to their shares, without undecided', () => {
  const average = computeAverage([poll({ pollster: 'Emerson' }), poll({ pollster: 'Siena' })], ASOF);
  assert.equal(average.status, 'average');
  assert.deepEqual(average.candidates.map((candidate) => [candidate.name, candidate.pct, candidate.polls]), [['Brown', 48, 2], ['Husted', 46, 2]]);
  assert.equal(average.leaderKey, 'S6OH00001');
  assert.equal(average.margin, 2);
  assert.equal(average.method, 'polls-avg-v1');
});

test('newer and larger polls weigh more', () => {
  // Same age: 4x the sample is 2x the weight. (50*2 + 40*1) / 3 = 46.7
  const bySample = computeAverage([poll({ pollster: 'A', sampleSize: 4000, d: 50 }), poll({ pollster: 'B', sampleSize: 1000, d: 40 })], ASOF);
  assert.equal(bySample.candidates.find((candidate) => candidate.name === 'Brown')?.pct, 46.7);

  // 14 days older is half the weight. (50*1 + 40*0.5) / 1.5 = 46.7
  const byAge = computeAverage([poll({ pollster: 'A', endDate: '2026-10-28', d: 50 }), poll({ pollster: 'B', endDate: '2026-10-14', d: 40 })], ASOF);
  assert.equal(byAge.candidates.find((candidate) => candidate.name === 'Brown')?.pct, 46.7);

  // Samples are capped at 5,000; a missing sample takes the median of the others.
  const capped = computeAverage([poll({ pollster: 'A', sampleSize: 50_000, d: 50 }), poll({ pollster: 'B', sampleSize: 5000, d: 40 })], ASOF);
  assert.equal(capped.candidates.find((candidate) => candidate.name === 'Brown')?.pct, 45);
  const missing = computeAverage([poll({ pollster: 'A', sampleSize: null, d: 50 }), poll({ pollster: 'B', sampleSize: 900, d: 40 })], ASOF);
  assert.equal(missing.candidates.find((candidate) => candidate.name === 'Brown')?.pct, 45);
});

test('each pollster counts once, internals not at all', () => {
  const older = poll({ pollster: 'Siena', endDate: '2026-10-01', d: 30 });
  const rv = poll({ pollster: 'Siena', population: 'RV', d: 60 });
  const lv = poll({ pollster: 'siena ', population: 'LV', d: 50 });
  assert.deepEqual(latestPerPollster([older, rv, lv]).map((item) => item.id), [lv.id]);

  const emerson = poll({ pollster: 'Emerson', d: 40 });
  const internal = poll({ pollster: 'Campaign', isInternal: true, d: 70 });
  const average = computeAverage([older, rv, lv, emerson, internal], ASOF);
  assert.equal(average.pollsterCount, 2);
  assert.deepEqual(average.pollIds.sort(), [lv.id, emerson.id].sort());
  assert.equal(average.candidates.find((candidate) => candidate.name === 'Brown')?.pct, 45);
});

test('a candidate in fewer than half the polls is left out; a tie has no leader', () => {
  const withThird = poll({ pollster: 'A' });
  withThird.answers.push({ choice: 'Jane Green', pct: 3, party: 'GRN', candidateFecId: null });
  const average = computeAverage([withThird, poll({ pollster: 'B' }), poll({ pollster: 'C' })], ASOF);
  assert.deepEqual(average.candidates.map((candidate) => candidate.name), ['Brown', 'Husted']);

  const tie = computeAverage([poll({ pollster: 'A', d: 47, r: 47 }), poll({ pollster: 'B', d: 47, r: 47 })], ASOF);
  assert.equal(tie.margin, null);
  assert.equal(tie.leaderKey, null);
});

test('unmatched answers are grouped by name, and one candidate counts once per poll', () => {
  const unmatched = (pollster: string, pct: number): AverageInputPoll => ({
    ...poll({ pollster }),
    answers: [
      { choice: 'Osborn', pct, party: 'IND', candidateFecId: null },
      { choice: 'Ricketts', pct: 48, party: 'REP', candidateFecId: 'S6NE00002' },
      { choice: 'Pete Ricketts', pct: 10, party: 'REP', candidateFecId: 'S6NE00002' },
    ],
  });
  const average = computeAverage([unmatched('A', 44), unmatched('B', 46)], ASOF);
  assert.deepEqual(average.candidates.map((candidate) => [candidate.key, candidate.pct, candidate.polls]), [
    ['S6NE00002', 48, 2],
    ['name:osborn', 45, 2],
  ]);
  assert.equal(average.candidates[1].party, 'IND');
});
