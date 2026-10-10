/** Public, read-only 2026 general-election market quotes from Kalshi. */
import {
  isOpen, isStateCode, marketUrl, partyFromTicker, partyNames, quotePrice,
  type KalshiEvent, type MarketScope,
} from './kalshi/shared.js';
import { getLiveEventQuotes } from './kalshi/live-feed.js';
import { env } from '../config/env.js';

export { isStateCode };
export type { MarketScope };
export type MarketProvider = 'KALSHI';
export interface MarketQuote {
  provider: MarketProvider;
  scope: MarketScope;
  eventTitle: string;
  outcome: string;
  pricePercent: number;
  priceType: 'MIDPOINT' | 'LAST_TRADE';
  url: string;
  fetchedAt: string;
}

const KALSHI_API = env.KALSHI_REST_URL;
const CACHE_MS = 60_000;
const cache = new Map<string, { expires: number; value: PredictionMarketResponse }>();
const pending = new Map<string, Promise<PredictionMarketResponse>>();

export interface PredictionMarketResponse {
  state: string | null;
  district: string | null;
  fetchedAt: string;
  quotes: MarketQuote[];
  providerStatus: Record<MarketProvider, 'available' | 'unavailable'>;
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function kalshiQuotes(ticker: string, scope: MarketScope, fetchedAt: string): Promise<MarketQuote[]> {
  // Prefer the WebSocket price board when it is live; it is fresher and costs no request.
  const live = getLiveEventQuotes(ticker);
  if (live) {
    return live.map((quote) => ({ provider: 'KALSHI' as const, scope, eventTitle: quote.eventTitle, outcome: quote.outcome,
      pricePercent: quote.pricePercent, priceType: quote.priceType, url: quote.url, fetchedAt: quote.updatedAt }));
  }
  const event = await getJson<{ event?: KalshiEvent }>(`${KALSHI_API}/events/${ticker}?with_nested_markets=true`);
  if (!event?.event || event.event.event_ticker !== ticker) return [];
  const title = event.event.title || ticker;
  return (event.event.markets || []).flatMap((market) => {
    if (!isOpen(market)) return [];
    const party = partyFromTicker(market.ticker || '');
    const outcome = market.yes_sub_title || (party && partyNames[party]) || market.title;
    if (!outcome) return [];
    const quote = quotePrice(market.yes_bid_dollars, market.yes_ask_dollars, market.last_price_dollars);
    if (!quote) return [];
    return [{ provider: 'KALSHI' as const, scope, eventTitle: title, outcome, ...quote, url: marketUrl(ticker, market.ticker), fetchedAt }];
  });
}

async function collect(state: string | null, district: string | null): Promise<PredictionMarketResponse> {
  const fetchedAt = new Date().toISOString();
  const jobs: Array<() => Promise<MarketQuote[]>> = [
    () => kalshiQuotes('CONTROLH-2026', 'NATIONAL_HOUSE', fetchedAt),
    () => kalshiQuotes('CONTROLS-2026', 'NATIONAL_SENATE', fetchedAt),
  ];
  if (state) {
    jobs.push(
      () => kalshiQuotes(`SENATE${state}-26`, 'STATE_SENATE', fetchedAt),
      // Special Senate elections (e.g. OH, FL in 2026) live in a separate series.
      () => kalshiQuotes(`SENATE${state}S-26`, 'STATE_SENATE', fetchedAt),
    );
  }
  if (state && district) {
    jobs.push(
      () => kalshiQuotes(`KXHOUSERACE-${state}${district}-26`, 'HOUSE_DISTRICT', fetchedAt),
      // Some competitive seats are their own series instead, unpadded (HOUSECA22-26, HOUSEPA7-26).
      () => kalshiQuotes(`HOUSE${state}${Number(district)}-26`, 'HOUSE_DISTRICT', fetchedAt),
    );
  }
  const settled = await Promise.allSettled(jobs.map((run) => run()));
  const quotes = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
  const providerStatus: PredictionMarketResponse['providerStatus'] = {
    KALSHI: settled.some((item) => item.status === 'rejected') ? 'unavailable' : 'available',
  };
  return { state, district, fetchedAt, quotes, providerStatus };
}

export function getPredictionMarkets(state: string | null, district: string | null): Promise<PredictionMarketResponse> {
  const key = `${state || ''}:${district || ''}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = collect(state, district).then((value) => {
    cache.set(key, { expires: Date.now() + CACHE_MS, value });
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
