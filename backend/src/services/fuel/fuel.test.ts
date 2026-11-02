import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { EiaClient, EiaError, parseSeries } from './eia-client.js';
import { AREAS, areaForState, FUEL_SERIES, STATE_REGION } from './fuel-catalog.js';
import { changeOver, costOfLiving, fuelView } from './fuel-read.js';
import { syncFuel } from './fuel-sync.js';

/** Weekly Mondays back from `last`, oldest first, priced by `price(weeksAgo)`. */
function weeks(last: string, count: number, price: (weeksAgo: number) => number) {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const weeksAgo = count - 1 - i;
    return { date: new Date(end - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10), value: price(weeksAgo) };
  });
}

test('every state and DC maps to its own EIA series or a labelled region', () => {
  assert.equal(Object.keys(STATE_REGION).length, 51);
  assert.equal(areaForState('gasoline', 'TX')?.code, 'STX');
  assert.equal(areaForState('diesel', 'TX')?.code, 'R30');
  assert.equal(areaForState('gasoline', 'PA')?.code, 'R1Y');
  assert.equal(areaForState('gasoline', 'NV')?.code, 'R5XCA');
  assert.equal(areaForState('diesel', 'CA')?.kind, 'state');
  assert.equal(areaForState('diesel', 'MI')?.kind, 'region');
  assert.equal(areaForState('gasoline', 'PR'), null);
  assert(FUEL_SERIES.some((def) => def.eiaId === 'EMM_EPMR_PTE_NUS_DPG'));
  assert(FUEL_SERIES.some((def) => def.eiaId === 'EMD_EPD2D_PTE_R5XCA_DPG'));
  assert(!FUEL_SERIES.some((def) => def.eiaId === 'EMD_EPD2D_PTE_STX_DPG'), 'EIA has no Texas diesel series');
});

test('EIA rows parse tolerantly: strings, duplicates, and blanks', () => {
  const points = parseSeries({ response: { data: [
    { period: '2026-10-26', value: '3.912' }, { period: '2026-10-19', value: 3.95 }, { period: '2026-10-19', value: 3.95 },
    { period: '2026-10-12', value: null }, { period: 'bad', value: 4 }, { period: '2026-10-05', value: 0 },
  ] } });
  assert.deepEqual(points, [{ date: '2026-10-19', value: 3.95 }, { date: '2026-10-26', value: 3.912 }]);
  assert.throws(() => parseSeries({ error: 'invalid api_key' }), EiaError);
});

test('changes use the same fixed windows for every area, and a missing week is null', () => {
  const points = weeks('2026-10-26', 60, (ago) => 4 - ago * 0.01);
  assert.deepEqual(changeOver(points, 1), { dollars: 0.01, percent: 0.3, from: '2026-10-19' });
  assert.equal(changeOver(points, 52)?.from, '2025-10-27');
  assert.equal(changeOver(points.slice(-10), 52), null);
  const view = fuelView('diesel', AREAS.R20, points, points.map((point) => ({ ...point, value: point.value + 0.2 })), new Date('2026-10-28T12:00:00Z'));
  assert.deepEqual(view.vsUs, { dollars: -0.2, percent: -4.8 });
  assert.equal(view.regional, true);
  assert.equal(view.stale, false);
  assert.equal(fuelView('diesel', AREAS.R20, points, points, new Date('2026-11-20T00:00:00Z')).stale, true);
});

test('the sync stores weeks once, updates revisions, and the read serves a state with its region', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const sourceKey = 'eia-test';
  const catalog = FUEL_SERIES.filter((def) => ['NUS', 'R20'].includes(def.area.code));
  const cleanup = async () => {
    await db.indicatorSeries.deleteMany({ where: { source: { key: sourceKey } } });
    await db.ingestionRun.deleteMany({ where: { source: { key: sourceKey } } });
    await db.dataSource.deleteMany({ where: { key: sourceKey } });
  };
  try {
    await cleanup();
    let bump = 0;
    const client = new EiaClient({
      apiKey: 'test',
      fetchJson: async (url) => {
        const regional = url.includes('_R20_');
        const diesel = url.includes('EPD2D');
        return { response: { data: weeks('2026-10-26', 60, (ago) => (diesel ? 4.6 : 3.4) + (regional ? -0.1 : 0) + (ago === 0 ? bump : 0) - ago * 0.005).map((point) => ({ period: point.date, value: point.value })) } };
      },
    });
    const now = new Date('2026-10-28T12:00:00Z');
    const first = await syncFuel(db, client, { catalog, sourceKey, now });
    assert.equal(first.status, 'SUCCEEDED');
    assert.equal(first.inserted, 4 * 60);
    bump = 0.05;
    const second = await syncFuel(db, client, { catalog, sourceKey, now });
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 4);

    const michigan = await costOfLiving(db, 'MI', now);
    const diesel = michigan.fuels.find((fuel) => fuel.fuel === 'diesel')!;
    assert.equal(diesel.area.code, 'R20');
    assert.equal(diesel.regional, true);
    assert.equal(diesel.latest?.value, 4.55);
    assert.equal(diesel.us?.value, 4.65);
    assert.equal(diesel.vsUs?.dollars, -0.1);
    assert(diesel.history.length > 50);
    assert.equal((await costOfLiving(db, null, now)).fuels[0].area.code, 'NUS');
  } finally {
    await cleanup();
    await db.$disconnect();
  }
});
