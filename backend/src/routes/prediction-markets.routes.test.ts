import assert from 'node:assert/strict';
import { test } from 'node:test';

test('history queries take race keys and a day count', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { historyQuery } = await import('./prediction-markets.routes.js');
  const parsed = historyQuery.parse({ race: 'pa-07, PA-SEN,US-HOUSE,PA-07' });
  assert.deepEqual(parsed.race.map((ref) => ref.race), ['PA-07', 'PA-SEN', 'US-HOUSE']);
  assert.equal(parsed.days, 14);
  assert.equal(historyQuery.parse({ race: 'DE-00', days: '30' }).days, 30);
  for (const query of [{ race: 'XX-99' }, { race: 'PA-07', days: '31' }, { race: 'PA-07', days: '0' }, { race: ',' }, {}]) {
    assert.equal(historyQuery.safeParse(query).success, false, JSON.stringify(query));
  }
  const tooMany = Array.from({ length: 17 }, (_, i) => `PA-${String(i + 1).padStart(2, '0')}`)
    .concat(Array.from({ length: 38 }, (_, i) => `TX-${String(i + 1).padStart(2, '0')}`), Array.from({ length: 9 }, (_, i) => `AZ-0${i + 1}`));
  assert.equal(historyQuery.safeParse({ race: tooMany.join(',') }).success, false);
});

test('movers queries default to 24 hours nationally', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { moversQuery } = await import('./prediction-markets.routes.js');
  assert.deepEqual(moversQuery.parse({}), { window: '24h', limit: 10 });
  assert.deepEqual(moversQuery.parse({ window: '7d', state: 'pa', limit: '5' }), { window: '7d', state: 'PA', limit: 5 });
  for (const query of [{ window: '30d' }, { state: 'XX' }, { limit: '0' }, { limit: '51' }]) {
    assert.equal(moversQuery.safeParse(query).success, false, JSON.stringify(query));
  }
});
