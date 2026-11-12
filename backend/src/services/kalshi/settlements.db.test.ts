import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { settlementDisagreements, syncSettlements } from './settlements.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('settlements: settled markets are stored once and linked to their race; open ones wait; a winner mismatch is listed', { skip: !testDatabaseUrl }, async (t) => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  t.mock.method(console, 'warn', () => {});
  const tickers = ['SETTLETEST-ZZ1-D', 'SETTLETEST-ZZ1-R', 'SETTLETEST-ZZ2-D', 'SETTLETEST-ZZ3-D'];
  try {
    await db.marketSettlement.deleteMany({ where: { sourceMarketId: { in: tickers } } });
    await db.marketSnapshot.deleteMany({ where: { sourceMarketId: { in: tickers } } });
    const kalshi = await db.dataSource.upsert({
      where: { key: 'kalshi' }, update: {},
      create: { key: 'kalshi', name: 'Kalshi', type: 'OTHER', attributionText: 'Market prices: Kalshi', isEnabled: true },
    });
    const event = await db.electionEvent.create({ data: { name: 'Settlement test', electionDate: new Date('2026-11-03T00:00:00Z'), type: 'GENERAL', cycle: 2026 } });
    const contest = await db.contest.create({ data: { electionEventId: event.id, name: 'ZZ House 1', office: 'US_HOUSE', stateCode: 'ZZ', districtCode: '01' } });
    const person = await db.person.create({ data: { displayName: 'Rae Winner', normalizedName: 'rae winner' } });
    const party = await db.party.upsert({ where: { name_sourceCode: { name: 'Republican', sourceCode: 'settle-test' } }, update: {}, create: { name: 'Republican', sourceCode: 'settle-test' } });
    const candidacy = await db.candidacy.create({ data: { personId: person.id, contestId: contest.id, partyId: party.id, ballotName: 'Rae Winner', ballotStatus: 'BALLOT_CONFIRMED' } });
    await db.raceCall.create({ data: { contestId: contest.id, candidacyId: candidacy.id, sourceId: kalshi.id, kind: 'WINNER', calledAt: new Date(), firstSeenAt: new Date() } });
    const row = (ticker: string, eventTicker: string, district: string, outcome: string) => ({
      sourceId: kalshi.id, provider: 'KALSHI' as const, scope: 'HOUSE_DISTRICT' as const, sourceEventId: eventTicker, sourceMarketId: ticker,
      outcome, stateCode: 'ZZ', districtCode: district, priceType: 'MIDPOINT' as const, price: 0.5,
      capturedHour: new Date('2026-11-04T02:00:00Z'), fetchedAt: new Date('2026-11-04T02:00:00Z'),
    });
    await db.marketSnapshot.createMany({ data: [
      row(tickers[0], 'SETTLETEST-ZZ1', '01', 'Democratic party'), row(tickers[1], 'SETTLETEST-ZZ1', '01', 'Republican party'),
      row(tickers[2], 'SETTLETEST-ZZ2', '02', 'Democratic party'), row(tickers[3], 'SETTLETEST-ZZ3', '03', 'Democratic party'),
    ] });
    const requests: string[] = [];
    const events: Record<string, unknown> = {
      'SETTLETEST-ZZ1': { event: { markets: [
        // Kalshi settled ZZ-01 on the Democrat, but the race was called for the Republican.
        { ticker: tickers[0], status: 'finalized', result: 'yes', settlement_value_dollars: '1.0000', settlement_ts: '2026-11-08T15:00:00Z' },
        { ticker: tickers[1], status: 'finalized', result: 'no', settlement_value_dollars: '0.0000' },
      ] } },
      'SETTLETEST-ZZ2': { event: { markets: [{ ticker: tickers[2], status: 'active', result: '' }] } },
      'SETTLETEST-ZZ3': { event: { markets: [{ ticker: tickers[3], status: 'settled', outcome: 'yes' }] } },
    };
    const fetchJson = async <T,>(url: string): Promise<T | null> => {
      const ticker = decodeURIComponent(/\/events\/([^?]+)/.exec(url)![1]);
      requests.push(ticker);
      return (events[ticker] as T) ?? null;
    };
    const since = new Date('2026-11-01T00:00:00Z');
    const first = await syncSettlements(db, 'https://kalshi.test/trade-api/v2', fetchJson, since);
    assert.equal(first.newlySettled, 2);
    assert.equal(first.unreadable, 1);
    const stored = await db.marketSettlement.findUniqueOrThrow({ where: { provider_sourceMarketId: { provider: 'KALSHI', sourceMarketId: tickers[0] } } });
    assert.equal(stored.result, 'YES');
    assert.equal(stored.settlementValue?.toNumber(), 1);
    assert.equal(stored.contestId, contest.id);
    assert.equal(stored.settledAt?.toISOString(), '2026-11-08T15:00:00.000Z');

    // A second run asks only about markets not settled yet.
    requests.length = 0;
    const second = await syncSettlements(db, 'https://kalshi.test/trade-api/v2', fetchJson, since);
    assert.equal(second.newlySettled, 0);
    assert(!requests.includes('SETTLETEST-ZZ1'));

    const disagreements = (await settlementDisagreements(db)).filter((item) => item.race.startsWith('ZZ-'));
    assert.deepEqual(disagreements.map((item) => [item.race, item.market]), [['ZZ-01', tickers[0]]]);
  } finally {
    await db.marketSettlement.deleteMany({ where: { sourceMarketId: { in: tickers } } }).catch(() => {});
    await db.marketSnapshot.deleteMany({ where: { sourceMarketId: { in: tickers } } }).catch(() => {});
    await db.electionEvent.deleteMany({ where: { name: 'Settlement test' } }).catch(() => {});
    await db.$disconnect();
  }
});
