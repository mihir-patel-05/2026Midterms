import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ACS_SOURCE_KEY, syncAcs } from './acs-sync.js';
import { CensusClient } from './census-client.js';
import { fakeCensusFetch } from './test-fixtures.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A vintage no real sync uses, so the test never touches real rows.
const YEAR = 2099;

test('ACS sync stores every geography level and fills district profiles', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    const client = new CensusClient({ apiKey: 'test', baseUrl: 'https://api.census.gov/data', year: YEAR, fetchImpl: fakeCensusFetch() });
    const stats = await syncAcs(db, client, YEAR, () => {});
    assert.deepEqual(stats.rows, { NATION: 1, STATE: 2, COUNTY: 3, CONGRESSIONAL_DISTRICT: 4, COUNTY_DISTRICT_PART: 5 });
    assert.equal(stats.districtProfiles, 4);

    // Re-running the same vintage updates rows in place.
    await syncAcs(db, new CensusClient({ baseUrl: 'https://api.census.gov/data', year: YEAR, fetchImpl: fakeCensusFetch() }), YEAR, () => {});
    assert.equal(await db.areaDemographics.count({ where: { acsYear: YEAR } }), 15);

    const part = await db.areaDemographics.findUniqueOrThrow({ where: { geoType_geoid_acsYear: { geoType: 'COUNTY_DISTRICT_PART', geoid: '4809157', acsYear: YEAR } } });
    assert.equal(part.stateCode, 'TX');
    assert.equal(part.countyFips, '48157');
    assert.equal(part.districtCode, '09');
    assert.equal((part.estimates as Record<string, number>).B01003_001, 200_000);
    assert(!part.sourceUrl.includes('key='));

    const dc = await db.districtProfile.findUniqueOrThrow({ where: { stateCode_districtCode_acsYear: { stateCode: 'DC', districtCode: '00', acsYear: YEAR } } });
    assert.equal(dc.population, 680_000);

    const source = await db.dataSource.findUniqueOrThrow({ where: { key: ACS_SOURCE_KEY } });
    assert.equal(source.healthStatus, 'CURRENT');
    const run = await db.ingestionRun.findFirstOrThrow({ where: { sourceId: source.id }, orderBy: { createdAt: 'desc' } });
    assert.equal(run.status, 'SUCCEEDED');
  } finally {
    await db.areaDemographics.deleteMany({ where: { acsYear: YEAR } });
    await db.districtProfile.deleteMany({ where: { acsYear: YEAR } });
    await db.$disconnect();
  }
});

test('a failed sync marks its run and the source instead of passing silently', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    const failing = (async () => new Response('error: unknown variable', { status: 400 })) as typeof fetch;
    const client = new CensusClient({ baseUrl: 'https://api.census.gov/data', year: YEAR, fetchImpl: failing });
    await assert.rejects(syncAcs(db, client, YEAR, () => {}), /unknown variable/);
    const source = await db.dataSource.findUniqueOrThrow({ where: { key: ACS_SOURCE_KEY } });
    assert.equal(source.healthStatus, 'DEGRADED');
    const run = await db.ingestionRun.findFirstOrThrow({ where: { sourceId: source.id }, orderBy: { createdAt: 'desc' } });
    assert.equal(run.status, 'FAILED');
  } finally {
    await db.$disconnect();
  }
});
