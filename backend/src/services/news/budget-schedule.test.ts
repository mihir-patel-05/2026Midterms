import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRunBudget, runCostUsd } from './budget.js';
import { isElectionNight, isNewsRunDue, newsIntervalMinutes, pickerIntervalMinutes } from './schedule.js';

const limits = { dailyUsd: 8, totalUsd: 100, pricePer1000Usd: 2, maxItemsPerRun: 200 };

test('a run gets the full item cap while plenty of budget is left', () => {
  assert.deepEqual(planRunBudget(limits, { last24hUsd: 1, totalUsd: 10 }), { ok: true, maxItems: 200, maxChargeUsd: 7, remainingUsd: 7 });
});

test('the smaller of the 24-hour and total budgets left caps the run', () => {
  const decision = planRunBudget(limits, { last24hUsd: 1, totalUsd: 99.85 });
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.maxItems, 75);
  assert.equal(decision.ok && decision.maxChargeUsd, 0.15);
});

test('a spent budget, or one too small for a useful run, skips the run with a reason', () => {
  assert.deepEqual(planRunBudget(limits, { last24hUsd: 2, totalUsd: 100 }), { ok: false, reason: 'The total news budget of $100.00 is spent', remainingUsd: 0 });
  assert.deepEqual(planRunBudget(limits, { last24hUsd: 8.5, totalUsd: 20 }), { ok: false, reason: 'The 24-hour news budget of $8.00 is spent', remainingUsd: 0 });
  const small = planRunBudget(limits, { last24hUsd: 7.97, totalUsd: 20 });
  assert.equal(small.ok, false);
  assert.match(!small.ok ? small.reason : '', /fewer than 20 articles/);
});

test('a run costs at least its articles times the price', () => {
  assert.equal(runCostUsd(150, 2, 0.1), 0.3);
  assert.equal(runCostUsd(150, 2, 0.45), 0.45);
  assert.equal(runCostUsd(0, 2, null), 0);
});

test('news runs speed up on election night and slow down after results day', () => {
  assert.equal(newsIntervalMinutes(new Date('2026-10-28T12:00:00Z')), 120);
  assert.equal(isElectionNight(new Date('2026-11-03T22:59:00Z')), false);
  assert.equal(newsIntervalMinutes(new Date('2026-11-03T23:00:00Z')), 30);
  assert.equal(pickerIntervalMinutes(new Date('2026-11-04T06:59:00Z')), 30);
  assert.equal(newsIntervalMinutes(new Date('2026-11-04T07:00:00Z')), 120);
  assert.equal(newsIntervalMinutes(new Date('2026-11-05T05:00:00Z')), 360);
  assert.equal(pickerIntervalMinutes(new Date('2026-11-10T12:00:00Z')), 60);
});

test('a run is due once its interval, less five minutes, has passed', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  assert.equal(isNewsRunDue(null, now), true);
  assert.equal(isNewsRunDue(new Date('2026-10-28T10:05:00Z'), now), true);
  assert.equal(isNewsRunDue(new Date('2026-10-28T10:30:00Z'), now), false);
});
