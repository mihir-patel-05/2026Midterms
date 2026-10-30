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

test('map requests name a known level and metric', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { demographicsMapQuery } = await import('./demographics.routes.js');

  assert.deepEqual(demographicsMapQuery.parse({ level: 'county', metric: 'race_hispanic', state: 'tx' }), { level: 'county', metric: 'race_hispanic', state: 'TX' });
  assert.deepEqual(demographicsMapQuery.parse({ level: 'state', metric: 'median_household_income' }), { level: 'state', metric: 'median_household_income' });
  assert.equal(demographicsMapQuery.safeParse({ level: 'tract', metric: 'population' }).success, false);
  assert.match(demographicsMapQuery.safeParse({ level: 'state', metric: 'shoe_size' }).error!.issues[0].message, /Unknown metric/);
  assert.match(demographicsMapQuery.safeParse({ level: 'district', metric: 'population', state: 'ZZ' }).error!.issues[0].message, /Unknown state/);
});

test('map values are keyed the way the map names its shapes', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { getDemographicsMap } = await import('../services/demographics.service.js');
  const row = (geoid: string, stateCode: string, districtCode: string | null, hispanic: number, total: number) => ({
    geoid, stateCode, districtCode, congress: 119, fetchedAt: new Date('2026-10-01T00:00:00Z'),
    estimates: { B03002_001: total, B03002_012: hispanic }, moes: { B03002_001: 0, B03002_012: 0 },
  });
  const calls: unknown[] = [];
  const db = {
    areaDemographics: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [row('4807', 'TX', '07', 300, 1000), row('4809', 'TX', '09', 600, 1000)];
      },
      findUnique: async () => row('1', 'US', null, 200, 1000),
    },
  } as never;

  const result = await getDemographicsMap(db, { level: 'district', metric: 'race_hispanic', state: 'TX', year: 2024 });
  assert.deepEqual(result.values, { 'TX-07': 0.3, 'TX-09': 0.6 });
  assert.equal(result.nation, 0.2);
  assert.equal(result.congress, 119);
  assert.equal(result.metric.kind, 'share');
  assert.deepEqual((calls[0] as { where: unknown }).where, { geoType: 'CONGRESSIONAL_DISTRICT', acsYear: 2024, stateCode: 'TX' });

  const empty = { areaDemographics: { findMany: async () => [], findUnique: async () => null } } as never;
  await assert.rejects(getDemographicsMap(empty, { level: 'state', metric: 'population', state: null, year: 2024 }), /have not been loaded/);
});
