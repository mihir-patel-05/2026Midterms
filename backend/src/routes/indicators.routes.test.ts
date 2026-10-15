import assert from 'node:assert/strict';
import { test } from 'node:test';

test('indicator requests are validated before touching the database', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { indicatorsQuery } = await import('./indicators.routes.js');

  assert.deepEqual(indicatorsQuery.parse({}), { days: 730 });
  assert.deepEqual(indicatorsQuery.parse({ days: '365' }), { days: 365 });
  for (const days of ['abc', '29', '1826', '30.5']) {
    const parsed = indicatorsQuery.safeParse({ days });
    assert.equal(parsed.success, false, days);
    assert.match(parsed.error!.issues[0].message, /whole number from 30 to 1825/);
  }
});
