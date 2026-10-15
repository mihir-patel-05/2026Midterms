import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FredClient, FredRequestError, parseObservations } from './fred-client.js';
import { FRED_SERIES } from './series-catalog.js';
import { fakeFredFetch } from './test-fixtures.js';

const BASE_URL = 'https://api.stlouisfed.org/fred';

test('missing "." values become no row, never 0', () => {
  const rows = parseObservations({
    observations: [
      { date: '2026-07-01', value: '4.1' },
      { date: '2026-07-02', value: '.' },
      { date: '2026-07-03', value: '' },
      { date: 'not-a-date', value: '1' },
      { date: '2026-07-06', value: '-0.25' },
    ],
  });
  assert.deepEqual(rows, [{ date: '2026-07-01', value: 4.1 }, { date: '2026-07-06', value: -0.25 }]);
  assert.throws(() => parseObservations({ error_message: 'x' }), FredRequestError);
});

test('requests send the key, but redacted URLs never contain it', async () => {
  const urls: URL[] = [];
  const fetchImpl = fakeFredFetch({ UNRATE: [['2026-08-01', '4.3'], ['2026-09-01', '4.4']] }, (url) => urls.push(url));
  const client = new FredClient({ apiKey: 'secret-key', baseUrl: `${BASE_URL}/`, fetchImpl });
  const rows = await client.getObservations('UNRATE', '2026-09-01');

  assert.deepEqual(rows, [{ date: '2026-09-01', value: 4.4 }]);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/fred/series/observations');
  assert.equal(urls[0].searchParams.get('api_key'), 'secret-key');
  assert.equal(urls[0].searchParams.get('file_type'), 'json');

  const logged = client.redactedUrl('UNRATE', '2026-09-01');
  assert.equal(logged, `${BASE_URL}/series/observations?series_id=UNRATE&observation_start=2026-09-01&file_type=json`);
  assert(!logged.includes('secret-key'));
});

test('server errors and rate limits are retried; bad requests are not', async () => {
  let calls = 0;
  const flaky = fakeFredFetch({ DGS10: [['2026-10-14', '4.12']] });
  const client = new FredClient({
    baseUrl: BASE_URL,
    retryDelayMs: 1,
    fetchImpl: (async (input: string | URL, init?: RequestInit) => {
      if (++calls === 1) return new Response('busy', { status: 503 });
      if (calls === 2) return new Response('slow down', { status: 429 });
      return flaky(input, init);
    }) as typeof fetch,
  });
  assert.deepEqual(await client.getObservations('DGS10', '2026-10-01'), [{ date: '2026-10-14', value: 4.12 }]);
  assert.equal(calls, 3);

  const urls: URL[] = [];
  const bad = new FredClient({ baseUrl: BASE_URL, retryDelayMs: 1, fetchImpl: fakeFredFetch({}, (url) => urls.push(url)) });
  await assert.rejects(bad.getObservations('NOPE', '2026-01-01'), /FRED API 400 for NOPE: Bad Request\.\s+The series does not exist\./);
  assert.equal(urls.length, 1);
});

test('the catalog has unique keys, and only S&P 500 and VIX are restricted', () => {
  const keys = FRED_SERIES.map((def) => def.key);
  assert.equal(new Set(keys).size, keys.length);
  assert(keys.every((key, i) => key === `fred.${FRED_SERIES[i].fredId}`));
  assert.deepEqual(FRED_SERIES.filter((def) => def.restricted).map((def) => def.fredId), ['SP500', 'VIXCLS']);
});
