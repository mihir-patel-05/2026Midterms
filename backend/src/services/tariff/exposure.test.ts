import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { CensusTradeClient, CensusTradeError, defaultTradeYear, parseStateTotals, syncStateImports } from './census-trade.js';
import { percentiles, scoreStates, tariffExposure, type RawInputs } from './exposure.js';
import { STATE_REGION } from '../fuel/fuel-catalog.js';

test('percentiles run 0 to 100 with ties at their midpoint', () => {
  const ranks = percentiles(new Map([['A', 1], ['B', 2], ['C', 2], ['D', 5]]));
  assert.deepEqual([...ranks], [['A', 0], ['B', 50], ['C', 50], ['D', 100]]);
  assert.deepEqual([...percentiles(new Map([['A', 3]]))], [['A', 0]]);
});

test('the score averages the parts a state has, needs three, and ranks most exposed first', () => {
  const part = (values: Record<string, number>) => new Map(Object.entries(values).map(([state, value]) => [state, { value, period: '2025' }]));
  const inputs: RawInputs = {
    importsToGdp: part({ MI: 20, TX: 15, VT: 5 }),
    partnerShare: part({ MI: 70, TX: 60, VT: 30 }),
    manufacturingShare: part({ MI: 13, TX: 7, VT: 9 }),
    dieselChange: new Map([['MI', { value: 12, period: 'x', regional: 'Midwest (PADD 2)' }], ['VT', { value: 8, period: 'x' }]]),
  };
  const scored = scoreStates(inputs, ['MI', 'TX', 'VT', 'WY']);
  assert.deepEqual(scored.map((item) => [item.state, item.score, item.rank, item.partsUsed]), [
    ['MI', 100, 1, 4], ['TX', 33.3, 2, 3], ['VT', 12.5, 3, 4], ['WY', null, null, 0],
  ]);
  assert.equal(scored[0].parts.dieselChange?.regional, 'Midwest (PADD 2)');
  assert.equal(scored[1].parts.dieselChange, undefined, 'missing stays missing, never zero');
});

test('Census tables sum HS2 chapters by state and refuse an unknown shape', () => {
  const states = new Set(['MI', 'TX']);
  const totals = parseStateTotals([
    ['STATE', 'GEN_VAL_YR', 'I_COMMODITY', 'COMM_LVL', 'time', 'CTY_CODE'],
    ['MI', '100', '01', 'HS2', '2025-12', '5700'], ['MI', '50', '02', 'HS2', '2025-12', '5700'],
    ['TX', '70', '01', 'HS2', '2025-12', '5700'], ['XX', '9', '01', 'HS2', '2025-12', '5700'], ['MI', '999', '0101', 'HS4', '2025-12', '5700'],
  ], states);
  assert.deepEqual([...totals], [['MI', 150], ['TX', 70]]);
  assert.throws(() => parseStateTotals([['A', 'B']], states), CensusTradeError);
  assert.throws(() => parseStateTotals({ error: 'bad key' }, states), CensusTradeError);
  assert.equal(defaultTradeYear(new Date('2026-11-01')), 2025);
  assert.equal(defaultTradeYear(new Date('2026-02-01')), 2024);
  assert.match(new CensusTradeClient({ baseUrl: 'https://api.census.gov/data' }).url('-', 2025, false), /statehs\?get=STATE%2CGEN_VAL_YR.*time=2025-12&CTY_CODE=-/);
});

test('the Census client asks for one state, retries a timeout, and reads no rows as null', async () => {
  const header = ['STATE', 'GEN_VAL_YR', 'I_COMMODITY', 'COMM_LVL'];
  const urls: string[] = [];
  let timeouts = 1;
  const client = new CensusTradeClient({
    baseUrl: 'https://census.example/data',
    apiKey: 'k',
    retryDelayMs: 0,
    fetchJson: async (url) => {
      urls.push(url);
      if (url.includes('CTY_CODE=5700') && timeouts-- > 0) throw new Error('The operation was aborted due to timeout');
      if (url.includes('CTY_CODE=1220')) return [];
      // Another state's rows are ignored, should Census send them.
      return [header, ['MI', '100', '01', 'HS2'], ['MI', '50', '02', 'HS2'], ['OH', '7', '01', 'HS2']];
    },
  });
  assert.equal(await client.stateTotal('5700', 2025, 'MI'), 150);
  assert.equal(client.requestCount, 2, 'one timeout, then an answer');
  assert.match(urls[0], /time=2025-12&CTY_CODE=5700&STATE=MI&key=k$/);
  assert.equal(await client.stateTotal('1220', 2025, 'MI'), null, 'no rows is null, for the caller to read');
  assert.equal(await client.stateTotal('2010', 2025, 'TX'), null);

  let attempts = 0;
  const down = new CensusTradeClient({ baseUrl: 'https://census.example/data', retryDelayMs: 0, fetchJson: async () => { attempts++; throw new Error('fetch failed'); } });
  await assert.rejects(down.stateTotal('-', 2025, 'MI'), /fetch failed/);
  assert.equal(attempts, 3, 'two retries');

  attempts = 0;
  const badShape = new CensusTradeClient({ baseUrl: 'https://census.example/data', retryDelayMs: 0, fetchJson: async () => { attempts++; return { error: 'unknown variable' }; } });
  await assert.rejects(badShape.stateTotal('-', 2025, 'MI'), CensusTradeError);
  assert.equal(attempts, 1, 'a bad answer is not asked again');
});

test('imports, GDP, jobs and diesel stored together give every state a score', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const sourceKey = 'census-trade-test';
  const states = ['MI', 'TX', 'VT', 'CA'];
  const cleanup = async () => {
    await db.indicatorSeries.deleteMany({ where: { OR: [{ source: { key: { in: [sourceKey, 'fred-exposure-test'] } } }] } });
    await db.ingestionRun.deleteMany({ where: { source: { key: { in: [sourceKey, 'fred-exposure-test'] } } } });
    await db.dataSource.deleteMany({ where: { key: { in: [sourceKey, 'fred-exposure-test'] } } });
  };
  try {
    await cleanup();
    const value = { MI: [150e9, 90e9], TX: [500e9, 300e9], VT: [5e9, 3.5e9], CA: [450e9, 200e9] } as Record<string, [number, number]>;
    const client = new CensusTradeClient({
      baseUrl: 'https://census.example/data',
      fetchJson: async (url) => {
        const all = url.includes('CTY_CODE=-');
        return [['STATE', 'GEN_VAL_YR', 'I_COMMODITY', 'COMM_LVL'], ...states.map((state) => [state, String(all ? value[state][0] : value[state][1] / 3), '01', 'HS2'])];
      },
    });
    const sync = await syncStateImports(db, client, states, { year: 2025, sourceKey });
    assert.equal(sync.status, 'SUCCEEDED');
    assert.equal(sync.states, 4);
    assert.deepEqual(sync.failed, []);
    assert.equal(sync.requests, 16, 'four requests for each state');
    const total = await db.indicatorObservation.findFirstOrThrow({ where: { series: { key: 'census.imports.all.MI' } } });
    assert.equal(total.value.toNumber(), 150e9);

    // FRED GDP (four 2025 quarters) and jobs, for the same states.
    const fred = await db.dataSource.create({ data: { key: 'fred-exposure-test', name: 'FRED test', type: 'OTHER', attributionText: 'test' } });
    const put = async (key: string, frequency: 'QUARTERLY' | 'MONTHLY', rows: Array<[string, number]>) => {
      const series = await db.indicatorSeries.upsert({ where: { key }, create: { key, name: key, unit: 'x', frequency, sourceId: fred.id }, update: {} });
      await db.indicatorObservation.createMany({ skipDuplicates: true, data: rows.map(([date, v]) => ({ seriesId: series.id, observedAt: new Date(`${date}T00:00:00Z`), value: new Prisma.Decimal(v), fetchedAt: new Date() })) });
    };
    const gdp = { MI: 700_000, TX: 2_600_000, VT: 45_000, CA: 4_000_000 } as Record<string, number>;
    const mfg = { MI: 620, TX: 950, VT: 30, CA: 1_250 } as Record<string, number>;
    const jobs = { MI: 4_450, TX: 14_100, VT: 315, CA: 18_100 } as Record<string, number>;
    for (const state of states) {
      await put(`fred.${state}NQGSP`, 'QUARTERLY', ['2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01'].map((date) => [date, gdp[state]]));
      await put(`fred.${state}MFG`, 'MONTHLY', [['2026-09-01', mfg[state]]]);
      await put(`fred.${state}NA`, 'MONTHLY', [['2026-09-01', jobs[state]]]);
    }
    const result = await tariffExposure(db, new Date('2026-11-01T00:00:00Z'));
    const mi = result.states.find((item) => item.state === 'MI')!;
    assert.equal(mi.partsUsed, 3, 'no diesel stored here, so three parts');
    assert.equal(mi.parts.importsToGdp?.value, 21.43);
    assert.equal(mi.parts.partnerShare?.value, 60);
    assert.equal(mi.parts.manufacturingShare?.value, 13.93);
    assert.equal(mi.parts.manufacturingShare?.period, 'Sep 2026');
    assert.notEqual(mi.score, null);
    assert.equal(result.states.filter((item) => item.score !== null).length, 4);
    assert.equal(result.periods.importsToGdp, '2025');
    assert(result.method.notes.some((note) => note.startsWith('Exposure, not a measured cost')));
  } finally {
    await cleanup();
    await db.$disconnect();
  }
});

test('a state whose request fails is left out, never zero, and a year Census lacks stops early', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const sourceKey = 'census-trade-partial-test';
  const states = Object.keys(STATE_REGION);
  const cleanup = async () => {
    await db.indicatorSeries.deleteMany({ where: { source: { key: sourceKey } } });
    await db.ingestionRun.deleteMany({ where: { source: { key: sourceKey } } });
    await db.dataSource.deleteMany({ where: { key: sourceKey } });
  };
  try {
    await cleanup();
    const rows = (state: string, value: number) => [['STATE', 'GEN_VAL_YR', 'I_COMMODITY', 'COMM_LVL'], [state, String(value), '01', 'HS2']];
    const client = new CensusTradeClient({
      baseUrl: 'https://census.example/data',
      retries: 0,
      fetchJson: async (url) => {
        const state = new URL(url).searchParams.get('STATE')!;
        if (state === 'OH' && url.includes('CTY_CODE=2010')) throw new Error('The operation was aborted due to timeout');
        return rows(state, url.includes('CTY_CODE=-') ? 900 : 100);
      },
    });
    const sync = await syncStateImports(db, client, states, { year: 2025, sourceKey });
    assert.equal(sync.status, 'PARTIAL');
    assert.equal(sync.states, 50);
    assert.deepEqual(sync.failed, ['OH: The operation was aborted due to timeout']);
    assert.equal(await db.indicatorSeries.count({ where: { key: { in: ['census.imports.all.OH', 'census.imports.cnmxca.OH'] } } }), 0, 'Ohio is left out, not written as zero');
    const mi = await db.indicatorObservation.findFirstOrThrow({ where: { series: { key: 'census.imports.cnmxca.MI' } } });
    assert.equal(mi.value.toNumber(), 300);
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { key: sourceKey } })).healthStatus, 'DEGRADED');

    // Census has no 2026 yet (204 for everything): stop once 45 states are out of reach, write nothing.
    const empty = new CensusTradeClient({ baseUrl: 'https://census.example/data', fetchJson: async () => [] });
    const none = await syncStateImports(db, empty, states, { year: 2026, sourceKey });
    assert.equal(none.status, 'FAILED');
    assert(none.requests <= 10, `stopped after ${none.requests} requests`);
    assert.equal(await db.indicatorObservation.count({ where: { series: { source: { key: sourceKey } }, observedAt: new Date(Date.UTC(2026, 0, 1)) } }), 0);
  } finally {
    await cleanup();
    await db.$disconnect();
  }
});
