import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorPathId, ApifyClient, ApifyRequestError, type Clock } from './apify-client.js';

interface Call { method: string; url: URL; body: unknown; auth: string | null }

function fakeApify(script: Array<(call: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    };
    calls.push(call);
    const next = script.shift();
    if (!next) throw new Error(`Unexpected request ${call.method} ${call.url}`);
    const { status = 200, body } = next(call);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function fakeClock(stepMs = 1000): Clock & { sleeps: number[] } {
  let now = 0;
  const sleeps: number[] = [];
  return { sleeps, now: () => (now += stepMs), sleep: async (ms) => { sleeps.push(ms); now += ms; } };
}

const run = (status: string, extra: Record<string, unknown> = {}) => ({ data: { id: 'run1', status, defaultDatasetId: 'ds1', ...extra } });

test('actor IDs use the tilde form in URLs', () => {
  assert.equal(actorPathId('tacps126/google-news'), 'tacps126~google-news');
});

test('a run is started with its limits, polled to the end, and its dataset read', async () => {
  const { fetchImpl, calls } = fakeApify([
    () => ({ status: 201, body: run('READY') }),
    () => ({ body: run('RUNNING') }),
    () => ({ body: run('SUCCEEDED', { usageTotalUsd: 0.12 }) }),
    () => ({ body: run('SUCCEEDED', { usageTotalUsd: 0.15 }) }),
    () => ({ body: [{ title: 'A' }, { title: 'B' }] }),
  ]);
  const clock = fakeClock();
  const client = new ApifyClient({ token: ' secret ', fetchImpl, clock, settleMs: 5000 });
  const result = await client.runActor('tacps126/google-news', { queries: ['x'] }, { maxItems: 150, maxChargeUsd: 1.234 });

  assert.equal(result.items.length, 2);
  assert.equal(result.aborted, false);
  // The settled second read wins.
  assert.equal(result.run.usageTotalUsd, 0.15);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.pathname, '/v2/acts/tacps126~google-news/runs');
  assert.equal(calls[0].url.searchParams.get('maxItems'), '150');
  assert.equal(calls[0].url.searchParams.get('maxTotalChargeUsd'), '1.23');
  assert.deepEqual(calls[0].body, { queries: ['x'] });
  assert.equal(calls[1].url.searchParams.get('waitForFinish'), '60');
  assert.equal(calls[4].url.pathname, '/v2/datasets/ds1/items');
  assert.equal(calls[4].url.searchParams.get('limit'), '150');
  for (const call of calls) {
    assert.equal(call.auth, 'Bearer secret');
    assert.doesNotMatch(String(call.url), /secret/);
  }
  assert.deepEqual(clock.sleeps, [5000]);
});

test('a run that outlives the poll timeout is aborted, and what it collected is still read', async () => {
  const { fetchImpl, calls } = fakeApify([
    () => ({ status: 201, body: run('RUNNING') }),
    () => ({ body: run('RUNNING') }),
    () => ({ body: run('ABORTING') }),
    () => ({ body: run('ABORTED') }),
    () => ({ body: run('ABORTED') }),
    () => ({ body: [{ title: 'A' }] }),
  ]);
  const client = new ApifyClient({ token: 't', fetchImpl, clock: fakeClock(4000), pollTimeoutMs: 5000, settleMs: 0 });
  const result = await client.runActor('cirkit/google-news-scraper', {}, { maxItems: 20, maxChargeUsd: 1 });
  assert.equal(result.aborted, true);
  assert.equal(result.run.status, 'ABORTED');
  assert.equal(result.items.length, 1);
  assert.equal(calls.filter((call) => call.url.pathname.endsWith('/abort')).length, 1);
});

test('GET requests retry 5xx answers, but a failed start is not retried', async () => {
  const { fetchImpl } = fakeApify([
    () => ({ status: 201, body: run('SUCCEEDED') }),
    () => ({ status: 502, body: {} }),
    () => ({ body: run('SUCCEEDED') }),
    () => ({ body: [] }),
  ]);
  const client = new ApifyClient({ token: 't', fetchImpl, clock: fakeClock(), settleMs: 0, retryDelayMs: 1 });
  assert.deepEqual((await client.runActor('a/b', {}, { maxItems: 20, maxChargeUsd: 1 })).items, []);

  const failing = fakeApify([() => ({ status: 402, body: { error: { message: 'Not enough credit' } } })]);
  const broke = new ApifyClient({ token: 't', fetchImpl: failing.fetchImpl, clock: fakeClock(), settleMs: 0 });
  await assert.rejects(broke.runActor('a/b', {}, { maxItems: 20, maxChargeUsd: 1 }), (error: unknown) => {
    assert.ok(error instanceof ApifyRequestError);
    assert.equal(error.status, 402);
    assert.match(error.message, /HTTP 402: Not enough credit/);
    return true;
  });
  assert.equal(failing.calls.length, 1);
});
