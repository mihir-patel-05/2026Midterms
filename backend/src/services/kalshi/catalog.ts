/**
 * Discovers every open Kalshi market for the 2026 general election that we can tie to
 * a race on the monitor: national House/Senate control, each state's Senate winner
 * (regular and special), and each House district winner.
 */
import {
  isOpen, isStateCode, marketUrl, partyFromTicker, partyNames, stateNames,
  type KalshiEvent, type KalshiMarket, type MarketScope,
} from './shared.js';
import { HOUSE_SEATS } from '../../utils/house-seats.js';

export interface CatalogMarket {
  ticker: string;
  eventTicker: string;
  eventTitle: string;
  scope: MarketScope;
  /** `US-HOUSE`, `US-SENATE`, `GA-SEN`, or `PA-07` (`DE-00` for at-large). */
  race: string;
  stateCode: string | null;
  district: string | null;
  outcome: string;
  party: 'D' | 'R' | null;
  url: string;
  /** Prices as Kalshi reported them when the catalog was built (dollar strings). */
  seed: { bid?: string; ask?: string; last?: string };
}

export type JsonFetcher = <T>(url: string) => Promise<T | null>;

const CONTROL_EVENTS: Array<[string, MarketScope, string]> = [
  ['CONTROLH-2026', 'NATIONAL_HOUSE', 'US-HOUSE'],
  ['CONTROLS-2026', 'NATIONAL_SENATE', 'US-SENATE'],
];
const HOUSE_SERIES = 'KXHOUSERACE';
const MAX_HOUSE_PAGES = 10;

/**
 * `KXHOUSERACE-PA07-26` → PA/07; `KXHOUSERACE-DEAL-26` (at-large) → DE/00.
 * Many competitive seats are instead their own series, unpadded: `HOUSECA22-26`, `HOUSEPA7-26`.
 */
export function parseHouseEventTicker(eventTicker: string): { stateCode: string; district: string } | null {
  const match = /^KXHOUSERACE-([A-Z]{2})(\d{2}|AL)-26$/.exec(eventTicker) ?? /^HOUSE([A-Z]{2})([1-9]\d?|AL)-26$/.exec(eventTicker);
  if (!match || !isStateCode(match[1])) return null;
  return { stateCode: match[1], district: match[2] === 'AL' ? '00' : match[2].padStart(2, '0') };
}

export function raceKey(scope: MarketScope, stateCode: string | null, district: string | null): string {
  if (scope === 'NATIONAL_HOUSE') return 'US-HOUSE';
  if (scope === 'NATIONAL_SENATE') return 'US-SENATE';
  if (scope === 'STATE_SENATE') return `${stateCode}-SEN`;
  return `${stateCode}-${district}`;
}

export function eventMarkets(
  event: KalshiEvent,
  scope: MarketScope,
  stateCode: string | null,
  district: string | null,
): CatalogMarket[] {
  const eventTicker = event.event_ticker;
  if (!eventTicker) return [];
  return (event.markets || []).flatMap((market: KalshiMarket) => {
    if (!market.ticker || !isOpen(market)) return [];
    const party = partyFromTicker(market.ticker);
    // House markets say "Democratic party"; normalise to the names used elsewhere.
    const subtitle = market.yes_sub_title?.trim();
    const outcome = party && (!subtitle || /^(democratic|republican) party$/i.test(subtitle))
      ? partyNames[party]
      : subtitle || market.title;
    if (!outcome) return [];
    return [{
      ticker: market.ticker,
      eventTicker,
      eventTitle: event.title || eventTicker,
      scope,
      race: raceKey(scope, stateCode, district),
      stateCode,
      district,
      outcome,
      party,
      url: marketUrl(eventTicker, market.ticker),
      seed: { bid: market.yes_bid_dollars, ask: market.yes_ask_dollars, last: market.last_price_dollars },
    }];
  });
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  }));
  return results;
}

export async function buildCatalog(restUrl: string, getJson: JsonFetcher): Promise<CatalogMarket[]> {
  const markets: CatalogMarket[] = [];

  for (const [ticker, scope] of CONTROL_EVENTS) {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    if (body?.event) markets.push(...eventMarkets(body.event, scope, null, null));
  }

  // One regular and one special Senate event per state; most return 404.
  const senateTickers = Object.keys(stateNames).flatMap((state) => [[state, `SENATE${state}-26`], [state, `SENATE${state}S-26`]]);
  const senate = await mapLimit(senateTickers, 3, async ([state, ticker]) => {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    return body?.event?.event_ticker === ticker ? eventMarkets(body.event, 'STATE_SENATE', state, null) : [];
  });
  markets.push(...senate.flat());

  let cursor = '';
  for (let page = 0; page < MAX_HOUSE_PAGES; page++) {
    const query = new URLSearchParams({ series_ticker: HOUSE_SERIES, status: 'open', with_nested_markets: 'true', limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const body = await getJson<{ events?: KalshiEvent[]; cursor?: string }>(`${restUrl}/events?${query}`);
    for (const event of body?.events ?? []) {
      const seat = parseHouseEventTicker(event.event_ticker || '');
      if (seat) markets.push(...eventMarkets(event, 'HOUSE_DISTRICT', seat.stateCode, seat.district));
    }
    cursor = body?.cursor || '';
    if (!cursor) break;
  }

  // Seats missing from KXHOUSERACE may have a per-district event (`HOUSECA22-26`); most of
  // these lookups return 404. Probe every state's remaining seats, not only competitive ones.
  const covered = new Set(markets.filter((market) => market.scope === 'HOUSE_DISTRICT').map((market) => market.race));
  const seatTickers = Object.keys(stateNames).flatMap((state) => {
    const seats = HOUSE_SEATS[state] ?? 0;
    return Array.from({ length: seats }, (_, index) => (seats === 1 ? 'AL' : String(index + 1)))
      .filter((seat) => !covered.has(`${state}-${seat === 'AL' ? '00' : seat.padStart(2, '0')}`))
      .map((seat) => `HOUSE${state}${seat}-26`);
  });
  const seats = await mapLimit(seatTickers, 3, async (ticker) => {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    const seat = parseHouseEventTicker(ticker);
    return body?.event?.event_ticker === ticker && seat ? eventMarkets(body.event, 'HOUSE_DISTRICT', seat.stateCode, seat.district) : [];
  });
  markets.push(...seats.flat());

  return markets;
}
