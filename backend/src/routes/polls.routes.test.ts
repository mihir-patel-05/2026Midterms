import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
// The handler test checks the answer when the polls database is not configured.
delete process.env.POLLS_DATABASE_URL;

test('poll queries are validated and normalized', async () => {
  const { pollsQuery, averagesQuery } = await import('./polls.routes.js');
  assert.deepEqual(pollsQuery.parse({ race: 'pa-sen' }), { race: 'PA-SEN', limit: 25 });
  assert.deepEqual(pollsQuery.parse({ race: ' PA-07 ', limit: '10' }), { race: 'PA-07', limit: 10 });
  for (const race of [undefined, '', 'PA', 'PA-7', 'PA-GOV', 'PENN-SEN', ['PA-SEN']]) {
    const parsed = pollsQuery.safeParse({ race });
    assert.equal(parsed.success, false, String(race));
    assert.match(parsed.error!.issues[0].message, /race code such as PA-SEN/);
  }
  for (const limit of ['0', '101', '2.5', 'x']) assert.equal(pollsQuery.safeParse({ race: 'PA-SEN', limit }).success, false, limit);

  assert.deepEqual(averagesQuery.parse({ races: 'pa-sen, PA-07,PA-07,' }), { races: ['PA-SEN', 'PA-07'] });
  for (const races of [undefined, '', 'PA-SEN,nope', Array.from({ length: 61 }, (_, i) => `CA-${String(i).padStart(2, '0')}`).join(',')]) {
    assert.equal(averagesQuery.safeParse({ races }).success, false, String(races).slice(0, 20));
  }
});

test('the polls API answers 400 for a bad race and 503 when the polls database is not configured', async () => {
  const express = (await import('express')).default;
  const { default: router } = await import('./polls.routes.js');
  const app = express();
  app.use('/api/polls', router);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/polls`;
    const bad = await fetch(`${base}?race=nope`);
    assert.equal(bad.status, 400);
    const missing = await fetch(`${base}?race=PA-SEN`);
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { error: 'Polls are not connected yet', code: 'NOT_CONFIGURED' });
    assert.equal((await fetch(`${base}/averages?races=PA-SEN`)).status, 503);
  } finally {
    server.close();
  }
});

test('admin poll review bodies are validated', async () => {
  const { acceptBody, reviewQuery } = await import('./admin-polls.routes.js');
  assert.deepEqual(acceptBody.parse({}), {});
  assert.deepEqual(acceptBody.parse({ raceCode: 'tx-15' }), { raceCode: 'TX-15' });
  assert.equal(acceptBody.safeParse({ raceCode: 'TX' }).success, false);
  assert.equal(acceptBody.safeParse({ raceCode: 'TX-15', status: 'PUBLISHED' }).success, false);
  assert.deepEqual(reviewQuery.parse({}), { limit: 50 });
  assert.equal(reviewQuery.safeParse({ reason: 'whatever' }).success, false);
});
