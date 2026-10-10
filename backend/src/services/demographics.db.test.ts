import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { syncAcs } from './census/acs-sync.js';
import { CensusClient } from './census/census-client.js';
import { fakeCensusFetch } from './census/test-fixtures.js';
import { DemographicsNotLoadedError, getDemographics } from './demographics.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// Its own vintage, so it never collides with acs-sync.db.test.ts or real rows.
const YEAR = 2098;
let db: PrismaClient;

const population = (metrics: Array<{ key: string; value: number | null }> | null) =>
  metrics?.find((metric) => metric.key === 'population')?.value;

before(async () => {
  if (!testDatabaseUrl) return;
  db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await syncAcs(db, new CensusClient({ baseUrl: 'https://api.census.gov/data', year: YEAR, fetchImpl: fakeCensusFetch() }), YEAR, () => {});
});

after(async () => {
  if (!testDatabaseUrl) return;
  await db.areaDemographics.deleteMany({ where: { acsYear: YEAR } });
  await db.districtProfile.deleteMany({ where: { acsYear: YEAR } });
  await db.$disconnect();
});

test('counties only combines the whole counties', { skip: !testDatabaseUrl }, async () => {
  const result = await getDemographics(db, { state: 'TX', counties: ['48201', '48157'], districts: [], year: YEAR });
  assert.equal(result.selection.mode, 'counties');
  assert.equal(population(result.combined), 5_700_000);
  assert.deepEqual(result.areas.map((area) => area.label), ['Fort Bend County', 'Harris County']);
  assert.equal(population(result.benchmarks.state?.metrics ?? null), 30_000_000);
  assert.equal(population(result.benchmarks.nation?.metrics ?? null), 330_000_000);
  assert.equal(result.source.dataset, `ACS ${YEAR - 4}–${YEAR} 5-year estimates`);
});

test('districts only combines the whole districts', { skip: !testDatabaseUrl }, async () => {
  const result = await getDemographics(db, { state: 'TX', counties: [], districts: ['07', '09'], year: YEAR });
  assert.equal(result.selection.mode, 'districts');
  assert.equal(population(result.combined), 1_540_000);
  assert.deepEqual(result.areas.map((area) => area.label), ['TX-07', 'TX-09']);
});

test('counties and districts together cover only their overlap', { skip: !testDatabaseUrl }, async () => {
  // Fort Bend touches TX-09 and TX-22; Harris touches TX-07 and TX-09.
  const result = await getDemographics(db, { state: 'TX', counties: ['48157'], districts: ['09', '07'], year: YEAR });
  assert.equal(result.selection.mode, 'overlap');
  assert.deepEqual(result.selection.districts, ['07', '09']);
  assert.deepEqual(result.areas.map((area) => [area.label, population(area.metrics)]), [['Fort Bend County · TX-09', 200_000]]);
  assert.equal(population(result.combined), 200_000);
  assert.deepEqual(result.noOverlap, { counties: [], districts: ['07'] });

  const both = await getDemographics(db, { state: 'TX', counties: ['48157', '48201'], districts: ['09'], year: YEAR });
  assert.deepEqual(both.areas.map((area) => area.label), ['Fort Bend County · TX-09', 'Harris County · TX-09']);
  assert.equal(population(both.combined), 770_000);
  // A combined median is estimated, never a published value.
  assert.equal(both.combined?.find((metric) => metric.key === 'median_household_income')?.estimated, true);
});

test('no overlap gives no combined figures rather than zeros', { skip: !testDatabaseUrl }, async () => {
  const result = await getDemographics(db, { state: 'TX', counties: ['48157'], districts: ['07'], year: YEAR });
  assert.equal(result.combined, null);
  assert.deepEqual(result.areas, []);
  assert.deepEqual(result.noOverlap, { counties: ['48157'], districts: ['07'] });
});

test('unknown areas are reported as missing', { skip: !testDatabaseUrl }, async () => {
  const result = await getDemographics(db, { state: 'TX', counties: ['48999'], districts: ['38'], year: YEAR });
  assert.deepEqual(result.missing, { counties: ['48999'], districts: ['38'] });
  assert.equal(result.combined, null);
});

test('at-large and delegate seats are addressed as district 00', { skip: !testDatabaseUrl }, async () => {
  const result = await getDemographics(db, { state: 'DC', counties: [], districts: ['00'], year: YEAR });
  assert.deepEqual(result.areas.map((area) => area.label), ['DC at-large']);
});

test('a vintage that was never synced is reported as not loaded', { skip: !testDatabaseUrl }, async () => {
  await assert.rejects(getDemographics(db, { state: 'TX', counties: ['48201'], districts: [], year: 2097 }), DemographicsNotLoadedError);
});
