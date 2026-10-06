/** Public, read-only 2026 general-election market quotes. */
import {
  isOpen, isStateCode, marketUrl, partyFromTicker, partyNames, quotePrice, stateNames, validPrice,
  type KalshiEvent, type MarketScope,
} from './kalshi/shared.js';
import { getLiveEventQuotes } from './kalshi/live-feed.js';
import { env } from '../config/env.js';

export { isStateCode };
export type { MarketScope };
export type MarketProvider = 'KALSHI' | 'POLYMARKET';
export interface MarketQuote {
  provider: MarketProvider;
  scope: MarketScope;
  eventTitle: string;
  outcome: string;
  pricePercent: number;
  priceType: 'MIDPOINT' | 'LAST_TRADE' | 'OUTCOME_PRICE';
  url: string;
  fetchedAt: string;
}

interface PolyMarket {
  question?: string;
  groupItemTitle?: string;
  outcomes?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
}
interface PolyEvent {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  markets?: PolyMarket[];
}

const KALSHI_API = env.KALSHI_REST_URL;
const POLY_API = 'https://gamma-api.polymarket.com';
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

function parseArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch { return []; }
}

function polyQuotes(event: PolyEvent | null, scope: MarketScope, fetchedAt: string): MarketQuote[] {
  if (!event?.active || event.closed || !event.slug) return [];
  return (event.markets || []).flatMap((market) => {
    if (!market.active || market.closed) return [];
    const outcome = market.groupItemTitle || market.question || '';
    if (!outcome) return [];
    const labels = parseArray(market.outcomes);
    const prices = parseArray(market.outcomePrices);
    const yesIndex = labels.findIndex((label) => label.toLowerCase() === 'yes');
    const price = validPrice(prices[yesIndex]);
    if (yesIndex < 0 || price === null) return [];
    return [{ provider: 'POLYMARKET' as const, scope, eventTitle: event.title || '',
      outcome, pricePercent: Math.round(price * 1000) / 10,
      priceType: 'OUTCOME_PRICE' as const, url: `https://polymarket.com/event/${event.slug}`, fetchedAt }];
  });
}

async function polyBySlug(slug: string): Promise<PolyEvent | null> {
  return getJson<PolyEvent>(`${POLY_API}/events/slug/${slug}`);
}

async function polyByExactTitle(query: string, expected: RegExp): Promise<PolyEvent | null> {
  const guessedSlug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  const direct = await polyBySlug(guessedSlug);
  if (direct && expected.test(direct.title || '') && /2026/.test(`${direct.description || ''} ${direct.title || ''}`)) return direct;
  const results = await getJson<{ events?: PolyEvent[] }>(`${POLY_API}/public-search?q=${encodeURIComponent(query)}&limit_per_type=20`);
  const match = results?.events?.find((event) => expected.test(event.title || '') && event.id);
  if (!match?.id) return null;
  const event = await getJson<PolyEvent>(`${POLY_API}/events/${encodeURIComponent(match.id)}`);
  return event && expected.test(event.title || '') && /2026/.test(`${event.description || ''} ${event.title || ''}`) &&
    !/primary|special election/i.test(event.title || '') ? event : null;
}

async function collect(state: string | null, district: string | null): Promise<PredictionMarketResponse> {
  const fetchedAt = new Date().toISOString();
  const jobs: Array<{ provider: MarketProvider; run: () => Promise<MarketQuote[]> }> = [
    { provider: 'KALSHI', run: () => kalshiQuotes('CONTROLH-2026', 'NATIONAL_HOUSE', fetchedAt) },
    { provider: 'KALSHI', run: () => kalshiQuotes('CONTROLS-2026', 'NATIONAL_SENATE', fetchedAt) },
    { provider: 'POLYMARKET', run: async () => polyQuotes(await polyBySlug('which-party-will-win-the-house-in-2026'), 'NATIONAL_HOUSE', fetchedAt) },
    { provider: 'POLYMARKET', run: async () => polyQuotes(await polyBySlug('which-party-will-win-the-senate-in-2026'), 'NATIONAL_SENATE', fetchedAt) },
  ];
  if (state) {
    jobs.push(
      { provider: 'KALSHI', run: () => kalshiQuotes(`SENATE${state}-26`, 'STATE_SENATE', fetchedAt) },
      // Special Senate elections (e.g. OH, FL in 2026) live in a separate series.
      { provider: 'KALSHI', run: () => kalshiQuotes(`SENATE${state}S-26`, 'STATE_SENATE', fetchedAt) },
      { provider: 'POLYMARKET', run: async () => polyQuotes(await polyByExactTitle(`${stateNames[state]} Senate Election Winner`, new RegExp(`^${stateNames[state]} (?:Senate (?:Election )?Winner|Senate Election)$`, 'i')), 'STATE_SENATE', fetchedAt) },
    );
  }
  if (state && district) {
    jobs.push(
      { provider: 'KALSHI', run: () => kalshiQuotes(`KXHOUSERACE-${state}${district}-26`, 'HOUSE_DISTRICT', fetchedAt) },
      { provider: 'POLYMARKET', run: async () => polyQuotes(await polyByExactTitle(`${state}-${district} House Election Winner`, new RegExp(`^${state}-${district} House Election Winner$`, 'i')), 'HOUSE_DISTRICT', fetchedAt) },
    );
  }
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const quotes = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
  const providerStatus: PredictionMarketResponse['providerStatus'] = { KALSHI: 'available', POLYMARKET: 'available' };
  settled.forEach((item, index) => { if (item.status === 'rejected') providerStatus[jobs[index].provider] = 'unavailable'; });
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
