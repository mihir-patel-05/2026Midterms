import assert from 'node:assert/strict';
import { test } from 'node:test';

test('demographics requests are validated before touching the database', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { demographicsQuery } = await import('./demographics.routes.js');

  const ok = demographicsQuery.parse({ state: 'tx', counties: '48201, 48157', districts: '07,09' });
  assert.deepEqual(ok, { state: 'TX', counties: ['48201', '48157'], districts: ['07', '09'] });
  assert.deepEqual(demographicsQuery.parse({ state: 'WY', districts: '00', year: '2024' }).year, 2024);

  const rejects = (query: Record<string, string>, message: RegExp) => {
    const parsed = demographicsQuery.safeParse(query);
    assert.equal(parsed.success, false);
    assert.match(parsed.error!.issues[0].message, message);
  };
  // No counties or districts means the whole state.
  assert.deepEqual(demographicsQuery.parse({ state: 'TX' }), { state: 'TX', counties: [], districts: [] });
  rejects({ state: 'TX', counties: '06037' }, /in the selected state/);
  rejects({ state: 'ZZ', districts: '01' }, /Unknown state/);
  assert.equal(demographicsQuery.safeParse({ state: 'TX', districts: '7' }).success, false);
  assert.equal(demographicsQuery.safeParse({ state: 'TX', counties: '4820' }).success, false);
  assert.equal(demographicsQuery.safeParse({ state: 'TX', districts: Array.from({ length: 61 }, (_, i) => String(i).padStart(2, '0')).join(',') }).success, false);
});
