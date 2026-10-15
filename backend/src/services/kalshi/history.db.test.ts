import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PrismaClient, type Prisma } from '@prisma/client';
import { getMarketHistory, getMovers, parseRaceKey } from './history.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// Hours in 2094, newer than anything a real feed writes, so the test never reads real rows.
const BASE = Date.UTC(2094, 0, 1);
const hour = (h: number) => new Date(BASE + h * 3_600_000);
const SOURCE_KEY = 'zztest-kalshi-history';
let db: PrismaClient;

before(async () => {
  if (!testDatabaseUrl) return;
  db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const source = await db.dataSource.upsert({
    where: { key: SOURCE_KEY },
    update: {},
    create: { key: SOURCE_KEY, name: 'ZZ test Kalshi', type: 'OTHER', authority: 'Test', attributionText: 'Test fixture', isEnabled: false, isMock: true },
  });
  const row = (ticker: string, outcome: string, h: number, price: number): Prisma.MarketSnapshotCreateManyInput => ({
    sourceId: source.id,
    provider: 'KALSHI',
    scope: 'HOUSE_DISTRICT',
    sourceEventId: 'ZZTEST-PA07',
    sourceMarketId: ticker,
    outcome,
    stateCode: 'PA',
    districtCode: '07',
    priceType: 'MIDPOINT',
    price,
    yesBid: price - 0.01,
    yesAsk: price + 0.01,
    capturedHour: hour(h),
    fetchedAt: hour(h),
  });
  await db.marketSnapshot.createMany({
    data: [
      row('ZZTEST-PA07-D', 'Democratic Party', 0, 0.4),
      row('ZZTEST-PA07-R', 'Republican Party', 0, 0.6),
      // Hours 1–23 missing.
      row('ZZTEST-PA07-D', 'Democratic Party', 24, 0.47),
      row('ZZTEST-PA07-R', 'Republican Party', 24, 0.53),
    ],
  });
});

after(async () => {
  if (!testDatabaseUrl) return;
  await db.marketSnapshot.deleteMany({ where: { source: { key: SOURCE_KEY } } });
  await db.dataSource.deleteMany({ where: { key: SOURCE_KEY } });
  await db.$disconnect();
});

test('history returns stored hours only, grouped by market', { skip: !testDatabaseUrl }, async () => {
  const result = await getMarketHistory(db, [parseRaceKey('PA-07')!], 2, hour(25));
  const [race] = result.races;
  assert.deepEqual(race.markets.map((market) => [market.party, market.points.map(([, pct]) => pct)]), [['D', [40, 47]], ['R', [60, 53]]]);
});

test('movers compare the newest hour with the hour 24 hours earlier', { skip: !testDatabaseUrl }, async () => {
  const result = await getMovers(db, { window: '24h', limit: 5, state: 'PA' });
  assert.equal(result.asOf, hour(24).toISOString());
  assert.deepEqual(result.movers.map((mover) => [mover.race, mover.party, mover.changePts]), [['PA-07', 'D', 7]]);
  assert.ok(result.historyStart && result.historyStart <= hour(0).toISOString());
});
