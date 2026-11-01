import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { CensusTradeClient, CensusTradeError, defaultTradeYear, parseStateTotals, syncStateImports } from './census-trade.js';
import { percentiles, scoreStates, tariffExposure, type RawInputs } from './exposure.js';

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
