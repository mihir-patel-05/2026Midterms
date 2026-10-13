import assert from 'node:assert/strict';
import { test } from 'node:test';

test('race queries are validated and normalized', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { raceQuery } = await import('./outside-spending.routes.js');
  assert.deepEqual(raceQuery.parse({ state: 'pa', office: 'h', district: '7' }), { state: 'PA', office: 'H', district: '07', cycle: 2026 });
  // Senate races carry no district; at-large House seats are 00.
  assert.deepEqual(raceQuery.parse({ state: 'AZ', office: 'S', district: '3', cycle: '2026' }), { state: 'AZ', office: 'S', district: null, cycle: 2026 });
  assert.equal(raceQuery.parse({ state: 'WY', office: 'H' }).district, '00');
  assert.equal(raceQuery.safeParse({ state: 'PA', office: 'H', district: '40' }).success, false);
  assert.equal(raceQuery.safeParse({ state: 'PA', office: 'P' }).success, false);
  assert.equal(raceQuery.safeParse({ state: 'PA', office: 'S', cycle: '2025' }).success, false);
});
