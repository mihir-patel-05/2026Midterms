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

  assert.deepEqual(indicatorsQuery.parse({ state: 'CA' }), { days: 730, state: 'CA' });
  assert.deepEqual(indicatorsQuery.parse({ days: '365', state: 'tx' }), { days: 365, state: 'TX' });
  // Shape only: a well-formed code FRED has no series for is answered with supported: false.
  assert.deepEqual(indicatorsQuery.parse({ state: 'pr' }), { days: 730, state: 'PR' });
  for (const state of ['ZZZ', 'C', '', 'C1', ['CA', 'TX']]) {
    const parsed = indicatorsQuery.safeParse({ state });
    assert.equal(parsed.success, false, String(state));
    assert.match(parsed.error!.issues[0].message, /two-letter postal code/);
  }
});
