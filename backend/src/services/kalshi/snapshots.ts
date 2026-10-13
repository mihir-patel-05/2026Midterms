/**
 * Hourly Kalshi price history. While the WebSocket is live, the feed writes one
 * market_snapshots row per market per hour from the prices it holds in memory.
 * Rows are keyed by (provider, market, hour), so a restart or a second replica
 * capturing the same hour is a no-op.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { CatalogMarket } from './catalog.js';
import { quoteFraction, validPrice } from './shared.js';

export const KALSHI_SOURCE_KEY = 'kalshi';

export interface SnapshotInput {
  market: Omit<CatalogMarket, 'seed'>;
  bid?: string;
  ask?: string;
  last?: string;
}

export type SnapshotWriter = (inputs: SnapshotInput[], capturedHour: Date, fetchedAt: Date) => Promise<number>;

export function hourStart(at: Date): Date {
  const hour = new Date(at);
  hour.setUTCMinutes(0, 0, 0);
  return hour;
}

const round4 = (value: number | null) => (value === null ? null : Math.round(value * 10_000) / 10_000);

/** Rows for every priced market; markets with no quote are skipped rather than stored as 0. */
export function snapshotRows(
  inputs: SnapshotInput[],
  sourceId: string,
  capturedHour: Date,
  fetchedAt: Date,
): Prisma.MarketSnapshotCreateManyInput[] {
  return inputs.flatMap(({ market, bid, ask, last }) => {
    const quote = quoteFraction(bid, ask, last);
    if (!quote) return [];
    return [{
      sourceId,
      provider: 'KALSHI' as const,
      scope: market.scope,
      sourceEventId: market.eventTicker,
      sourceMarketId: market.ticker,
      outcome: market.outcome,
      stateCode: market.stateCode,
      districtCode: market.district,
      priceType: quote.priceType,
      price: quote.price,
      yesBid: round4(validPrice(bid)),
      yesAsk: round4(validPrice(ask)),
      sourceUrl: market.url,
      capturedHour,
      fetchedAt,
    }];
  });
}

export const writeMarketSnapshots: SnapshotWriter = async (inputs, capturedHour, fetchedAt) => {
  const source = await prisma.dataSource.upsert({
    where: { key: KALSHI_SOURCE_KEY },
    update: { lastCheckedAt: fetchedAt },
    create: {
      key: KALSHI_SOURCE_KEY,
      name: 'Kalshi',
      type: 'OTHER',
      authority: 'Kalshi',
      homepageUrl: 'https://kalshi.com',
      attributionText: 'Market prices from Kalshi. Traded prices, not forecasts or results.',
      coverageDescription: '2026 House and Senate control, Senate races, and House district winner markets.',
      expectedCadenceSeconds: 3600,
      isEnabled: true,
      lastCheckedAt: fetchedAt,
    },
  });
  const rows = snapshotRows(inputs, source.id, capturedHour, fetchedAt);
  const { count } = await prisma.marketSnapshot.createMany({ data: rows, skipDuplicates: true });
  await prisma.dataSource.update({
    where: { id: source.id },
    data: { healthStatus: 'CURRENT', lastSuccessfulAt: fetchedAt },
  });
  return count;
};
