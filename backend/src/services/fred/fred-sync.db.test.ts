import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { FredClient } from './fred-client.js';
import { syncFred } from './fred-sync.js';
import { getIndicators } from './indicator-read.js';
import type { FredSeriesDef } from './series-catalog.js';
import { fakeFredFetch, type FakeSeries } from './test-fixtures.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A source and series keys no real sync uses, so the test never touches real rows.
const SOURCE_KEY = 'fred-test';
const NOW = new Date('2026-10-15T14:00:00Z');

const catalog: FredSeriesDef[] = ['RATE', 'CLAIMS'].map((fredId) => ({
  fredId,
  key: `fred-test.${fredId}`,
  name: `Test ${fredId}`,
  unit: 'Percent',
  frequency: 'MONTHLY',
  originalSource: 'Test agency',
  transform: 'level',
  restricted: false,
}));

const values = async (db: PrismaClient, key: string) => {
  const rows = await db.indicatorObservation.findMany({ where: { series: { key } }, orderBy: { observedAt: 'asc' } });
  return rows.map((row) => [row.observedAt.toISOString().slice(0, 10), row.value.toNumber()]);
};

test('FRED sync backfills, re-runs cheaply, applies revisions, and survives a failing series', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const series: Record<string, FakeSeries> = {
    // 2020 is older than the 5-year backfill and is never requested.
    RATE: [['2020-01-01', '9.9'], ['2022-01-01', '3.9'], ['2026-08-01', '4.3'], ['2026-09-01', '.'], ['2026-09-02', '4.4']],
    CLAIMS: [['2026-08-01', '230000'], ['2026-09-01', '225000']],
  };
  const starts: string[] = [];
  const client = () => new FredClient({ apiKey: 'test', baseUrl: 'https://api.stlouisfed.org/fred', retries: 0, minIntervalMs: 0, fetchImpl: fakeFredFetch(series, (url) => starts.push(`${url.searchParams.get('series_id')}:${url.searchParams.get('observation_start')}`)) });
  const sync = () => syncFred(db, client(), { catalog, sourceKey: SOURCE_KEY, now: NOW, log: () => {} });
  try {
    const first = await sync();
    assert.equal(first.status, 'SUCCEEDED');
    assert.deepEqual(starts, ['RATE:2021-10-15', 'CLAIMS:2021-10-15']);
    assert.deepEqual(await values(db, 'fred-test.RATE'), [['2022-01-01', 3.9], ['2026-08-01', 4.3], ['2026-09-02', 4.4]]);

    // A second run only re-fetches the last 400 days and writes nothing.
    starts.length = 0;
    const second = await sync();
    assert.deepEqual(starts, ['RATE:2025-09-10', 'CLAIMS:2025-09-10']);
    assert.deepEqual(second.series.map((s) => [s.inserted, s.updated, s.unchanged]), [[0, 0, 2], [0, 0, 2]]);

    // A revision updates the row in place; a new month is inserted; a failing series keeps its rows.
    series.RATE = [['2026-08-01', '4.2'], ['2026-09-02', '4.4'], ['2026-10-01', '4.5']];
    series.CLAIMS = 503;
    const third = await sync();
    assert.equal(third.status, 'PARTIAL');
    assert.deepEqual(third.series.map((s) => [s.inserted, s.updated, s.unchanged]), [[1, 1, 1], [0, 0, 0]]);
    assert.match(third.series[1].error ?? '', /503/);
    assert.deepEqual(await values(db, 'fred-test.RATE'), [['2022-01-01', 3.9], ['2026-08-01', 4.2], ['2026-09-02', 4.4], ['2026-10-01', 4.5]]);
    assert.equal((await values(db, 'fred-test.CLAIMS')).length, 2);

    const source = await db.dataSource.findUniqueOrThrow({ where: { key: SOURCE_KEY } });
    assert.equal(source.healthStatus, 'DEGRADED');
    const run = await db.ingestionRun.findFirstOrThrow({ where: { sourceId: source.id }, orderBy: { createdAt: 'desc' } });
    assert.equal(run.status, 'PARTIAL');
    assert.match(run.errorSummary ?? '', /^CLAIMS: /);
    assert(!JSON.stringify(run.metadata).includes('api_key'));

    // The read model serves what the sync stored; 2022 is outside the 730-day window.
    const read = await getIndicators(db, { days: 730, includeRestricted: false, now: NOW, catalog });
    assert.deepEqual(read.series.map((s) => [s.fredId, s.latest?.value, s.latest?.period, s.history.length]), [['RATE', 4.5, 'Oct 2026', 3], ['CLAIMS', 225000, 'Sep 2026', 2]]);
    assert.equal(read.series[0].change?.toFixed(2), '0.10');

    // Every series failing fails the run.
    series.RATE = 400;
    assert.equal((await sync()).status, 'FAILED');
  } finally {
    const source = await db.dataSource.findUnique({ where: { key: SOURCE_KEY } });
    await db.indicatorSeries.deleteMany({ where: { key: { startsWith: 'fred-test.' } } });
    if (source) {
      await db.ingestionRun.deleteMany({ where: { sourceId: source.id } });
      await db.dataSource.delete({ where: { id: source.id } });
    }
    await db.$disconnect();
  }
});
