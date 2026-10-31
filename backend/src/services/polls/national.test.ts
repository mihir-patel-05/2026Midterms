import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNationalEnvironment, NATIONAL_CACHE_MS, NationalPollsCache, parseNationalPoll } from './national.js';

const NOW = new Date('2026-10-31T12:00:00Z');
let next = 0;
const approval = (pollster: string, endDate: string, approve: number, disapprove: number, extra: Record<string, unknown> = {}) => ({
  id: `a${++next}`,
  poll_type: 'approval',
  subject: 'Donald Trump',
  pollster,
  start_date: endDate,
  end_date: endDate,
  sample_size: 1000,
  population: 'rv',
  partisan: null,
  answers: [{ choice: 'Approve', pct: approve }, { choice: 'Disapprove', pct: disapprove }, { choice: 'Not Sure', pct: 100 - approve - disapprove }],
  ...extra,
});
const ballot = (pollster: string, endDate: string, dem: number, rep: number, extra: Record<string, unknown> = {}) => ({
  id: `g${++next}`,
  poll_type: 'generic-ballot',
  subject: '2026',
  pollster,
  end_date: endDate,
  sample_size: 1000,
  population: 'lv',
  answers: [{ choice: 'Dem', pct: dem }, { choice: 'Rep', pct: rep }],
  ...extra,
});

test('national poll records are read, and other subjects and broken records are skipped', () => {
  const poll = parseNationalPoll(approval('Pew Research Center', '2026-10-04', 30, 68, { population: 'a', url: 'https://example.org/pew' }), 'Donald Trump');
  assert.equal(poll?.population, 'A');
  assert.equal(poll?.answers.length, 3);
  assert.equal(poll?.url, 'https://example.org/pew');
  assert.equal(parseNationalPoll(approval('Pew', '2026-10-04', 30, 68, { subject: 'Congress' }), 'Donald Trump'), null);
  assert.equal(parseNationalPoll(approval('Pew', 'soon', 30, 68), 'Donald Trump'), null);
  assert.equal(parseNationalPoll({ ...approval('Pew', '2026-10-04', 30, 68), answers: [{ choice: 'Approve', pct: 130 }] }, 'Donald Trump'), null);
  assert.equal(parseNationalPoll(approval('Pew', '2026-10-04', 30, 68, { partisan: 'REP' }), 'Donald Trump')?.partisan, 'REP');
});

test('approval and the generic ballot are averaged, with net approval and the Democratic margin', () => {
  const env = buildNationalEnvironment({
    approval: [
      approval('RMG Research', '2026-10-28', 44, 54),
      approval('YouGov', '2026-10-27', 40, 56),
      // Older poll from the same firm: replaced by its newest.
      approval('YouGov', '2026-10-20', 30, 60),
      // A party-sponsored poll is listed, never averaged.
      approval('Partisan Co', '2026-10-29', 60, 38, { partisan: 'REP' }),
      approval('Congress poll', '2026-10-29', 20, 70, { subject: 'Congress' }),
    ],
    genericBallot: [ballot('Pew', '2026-10-25', 46, 42), ballot('Emerson', '2026-10-26', 48, 46)],
  }, NOW);

  assert.equal(env.asOf, '2026-10-31');
  assert.equal(env.approval.status, 'average');
  assert.equal(env.approval.pollsterCount, 2);
  assert.ok(env.approval.approve! > 40 && env.approval.approve! < 44);
  assert.equal(env.approval.net, Math.round((env.approval.approve! - env.approval.disapprove!) * 10) / 10);
  assert.equal(env.approval.recent[0].pollster, 'Partisan Co');
  assert.equal(env.approval.recent[0].inAverage, false);
  assert.equal(env.approval.recent.find((poll) => poll.pollster === 'RMG Research')?.inAverage, true);
  assert.ok(!env.approval.recent.some((poll) => poll.pollster === 'Congress poll'));

  assert.equal(env.genericBallot.status, 'average');
  assert.ok(env.genericBallot.margin! > 2 && env.genericBallot.margin! < 4);
  assert.equal(env.source.name, 'VoteHub');
});

test('one pollster, old polls, and no polls are their own states, never a number', () => {
  const env = buildNationalEnvironment({ approval: [approval('Pew', '2026-10-28', 30, 68)], genericBallot: [ballot('Pew', '2026-08-01', 46, 42)] }, NOW);
  assert.equal(env.approval.status, 'too_few');
  assert.equal(env.approval.net, null);
  assert.equal(env.approval.recent.length, 1);
  assert.equal(env.genericBallot.status, 'stale');
  assert.equal(env.genericBallot.margin, null);
  assert.equal(env.genericBallot.newestEndDate, '2026-08-01');
  assert.equal(buildNationalEnvironment({ approval: [], genericBallot: [] }, NOW).approval.status, 'none');
});

test('the cache fetches once per window and serves the last good answer when VoteHub fails', async () => {
  let clock = NOW.getTime();
  let calls = 0;
  let fail = false;
  const client = {
    getPolls: async (pollType: string) => {
      calls++;
      if (fail) throw new Error('VoteHub down');
      return pollType === 'approval' ? [approval('Pew', '2026-10-28', 30, 68)] : [ballot('Pew', '2026-10-28', 46, 42)];
    },
  };
  const cache = new NationalPollsCache(client, () => clock);

  fail = true;
  await assert.rejects(cache.get(), /VoteHub down/);
  fail = false;
  const [first, second] = await Promise.all([cache.get(), cache.get()]);
  assert.equal(first, second);
  const fetched = calls;
  await cache.get();
  assert.equal(calls, fetched);

  clock += NATIONAL_CACHE_MS + 1;
  fail = true;
  assert.equal(await cache.get(), first);
  assert.ok(calls > fetched);
});
