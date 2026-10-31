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
import { majorParty, matchName } from '../../utils/person-name.js';
import { ballotRaces } from '../../utils/races.js';

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
const MAX_STATE_SERIES_PAGES = 3;
const OTHER_OFFICE = /governor|lieutenant|attorney general|secretary of state|treasurer|controller|comptroller|superintendent|commissioner|state senate|assembly|legislat|mayor|proposition|measure|senate/i;
const stateElectionSeries = (state: string) => `KX${state}ELECTION`;
/** A state's district codes: `00` at-large, else `01`…`52`. */
const houseSeats = (state: string) => {
  const seats = HOUSE_SEATS[state] ?? 0;
  return seats === 1 ? ['00'] : Array.from({ length: seats }, (_, index) => String(index + 1).padStart(2, '0'));
};

/**
 * `KXHOUSERACE-PA07-26` → PA/07; `KXHOUSERACE-DEAL-26` (at-large) → DE/00.
 * Many competitive seats are instead their own series, unpadded: `HOUSECA22-26`, `HOUSEPA7-26`.
 */
export function parseHouseEventTicker(eventTicker: string): { stateCode: string; district: string } | null {
  const match = /^KXHOUSERACE-([A-Z]{2})(\d{2}|AL)-26$/.exec(eventTicker) ?? /^HOUSE([A-Z]{2})([1-9]\d?|AL)-26$/.exec(eventTicker);
  if (!match || !isStateCode(match[1])) return null;
  return { stateCode: match[1], district: match[2] === 'AL' ? '00' : match[2].padStart(2, '0') };
}

/**
 * Same-party and top-two general elections (both nominees are Democrats in CA-07) are not in
 * KXHOUSERACE. Kalshi lists them in a per-state series, one event per district:
 * `KXCAELECTION-2607` → CA/07. The same series can hold statewide races, so only a two-digit
 * district (or `AL`) that exists in the state counts, and titles naming another office are refused.
 */
export function parseStateElectionEvent(eventTicker: string, title = ''): { stateCode: string; district: string } | null {
  const match = /^KX([A-Z]{2})ELECTION-26(\d{2}|AL)$/.exec(eventTicker);
  if (!match || !isStateCode(match[1])) return null;
  if (OTHER_OFFICE.test(title)) return null;
  const seats = HOUSE_SEATS[match[1]] ?? 0;
  if (seats === 1) return match[2] === 'AL' || match[2] === '00' || match[2] === '01' ? { stateCode: match[1], district: '00' } : null;
  const number = Number(match[2]);
  return number >= 1 && number <= seats ? { stateCode: match[1], district: match[2] } : null;
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

/** The event tickers the catalog looks for a race under, for the "no market" log. */
export function tickersTried(race: string): string[] {
  const [state, seat] = race.split('-');
  if (seat === 'SEN') return [`SENATE${state}-26`, `SENATE${state}S-26`];
  const code = seat === '00' ? 'AL' : seat;
  return [`KXHOUSERACE-${state}${code}-26`, `KX${state}ELECTION-26${code}`, `HOUSE${state}${seat === '00' ? 'AL' : Number(seat)}-26`];
}

export interface CatalogResult {
  markets: CatalogMarket[];
  /** Lookups that failed (a 429 after every retry, a timeout); their markets are missing from `markets`. */
  failed: number;
  /** The first failure's message, for the log. */
  error: string | null;
}

/**
 * Every open market we can tie to a race. `onNote` hears each event the catalog found but
 * could not use (a ticker that is not a district, another office, or no open market), so new
 * layouts show up in the logs. A failed lookup is counted and skipped, not thrown, so one
 * rate-limited request costs only its own markets.
 */
export async function buildCatalog(
  restUrl: string,
  fetchJson: JsonFetcher,
  onNote: (note: string) => void = () => {},
): Promise<CatalogResult> {
  const markets: CatalogMarket[] = [];
  let failed = 0;
  let error: string | null = null;
  const getJson: JsonFetcher = async <T>(url: string) => {
    try {
      return await fetchJson<T>(url);
    } catch (cause) {
      failed++;
      error ??= cause instanceof Error ? cause.message : String(cause);
      return null;
    }
  };
  const describe = (event: KalshiEvent) => `${event.event_ticker} (${event.title ?? 'untitled'})`;
  // eventMarkets, noting an event whose markets are all closed or not yet open.
  const usable = (event: KalshiEvent, scope: MarketScope, stateCode: string | null, district: string | null) => {
    const found = eventMarkets(event, scope, stateCode, district);
    if (found.length === 0) {
      const statuses = [...new Set((event.markets ?? []).map((market) => market.status ?? 'unknown'))].join(', ') || 'no markets';
      onNote(`${describe(event)} has no open market (${statuses})`);
    }
    return found;
  };

  for (const [ticker, scope] of CONTROL_EVENTS) {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    if (body?.event) markets.push(...eventMarkets(body.event, scope, null, null));
  }

  // A regular and a special Senate event for each state with a race this year; one of the two returns 404.
  const senateStates = (ballotRaces(2026) ?? []).filter((race) => race.officeType === 'SENATE').map((race) => race.state);
  const senateTickers = senateStates.flatMap((state) => [[state, `SENATE${state}-26`], [state, `SENATE${state}S-26`]]);
  const senate = await mapLimit(senateTickers, 3, async ([state, ticker]) => {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    return body?.event?.event_ticker === ticker ? usable(body.event, 'STATE_SENATE', state, null) : [];
  });
  markets.push(...senate.flat());

  const failedBeforeHouse = failed;
  let cursor = '';
  for (let page = 0; page < MAX_HOUSE_PAGES; page++) {
    const query = new URLSearchParams({ series_ticker: HOUSE_SERIES, status: 'open', with_nested_markets: 'true', limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const body = await getJson<{ events?: KalshiEvent[]; cursor?: string }>(`${restUrl}/events?${query}`);
    for (const event of body?.events ?? []) {
      const seat = parseHouseEventTicker(event.event_ticker || '');
      if (seat) markets.push(...usable(event, 'HOUSE_DISTRICT', seat.stateCode, seat.district));
      else onNote(`${describe(event)} is not a district ticker we read`);
    }
    cursor = body?.cursor || '';
    if (!cursor) break;
  }
  // Without every KXHOUSERACE page, nearly every seat looks uncovered and the steps below
  // would probe hundreds of them; stop here and let the retry finish the job.
  if (failed > failedBeforeHouse) return { markets, failed, error };

  // Same-party and top-two races live in per-state series (`KXCAELECTION-2607`). Only states
  // with a seat KXHOUSERACE left uncovered are searched, to keep each refresh under Kalshi's rate limit.
  const houseCovered = () => new Set(markets.filter((market) => market.scope === 'HOUSE_DISTRICT').map((market) => market.race));
  const fromKxHouse = houseCovered();
  const uncoveredStates = Object.keys(stateNames).filter((state) => houseSeats(state).some((seat) => !fromKxHouse.has(`${state}-${seat}`)));
  const stateSeries = await mapLimit(uncoveredStates, 3, async (state) => {
    const found: CatalogMarket[] = [];
    let seriesCursor = '';
    for (let page = 0; page < MAX_STATE_SERIES_PAGES; page++) {
      const query = new URLSearchParams({ series_ticker: stateElectionSeries(state), status: 'open', with_nested_markets: 'true', limit: '200' });
      if (seriesCursor) query.set('cursor', seriesCursor);
      const body = await getJson<{ events?: KalshiEvent[]; cursor?: string }>(`${restUrl}/events?${query}`);
      for (const event of body?.events ?? []) {
        const seat = parseStateElectionEvent(event.event_ticker || '', event.title);
        if (!seat) {
          onNote(`${describe(event)} is not a House race`);
          continue;
        }
        if (!fromKxHouse.has(`${seat.stateCode}-${seat.district}`)) found.push(...usable(event, 'HOUSE_DISTRICT', seat.stateCode, seat.district));
      }
      seriesCursor = body?.cursor || '';
      if (!seriesCursor) break;
    }
    return found;
  });
  markets.push(...stateSeries.flat());

  // Seats missing from both may have a per-district event (`HOUSECA22-26`); most of
  // these lookups return 404. Probe every state's remaining seats, not only competitive ones.
  const covered = houseCovered();
  const seatTickers = Object.keys(stateNames).flatMap((state) => houseSeats(state)
    .filter((seat) => !covered.has(`${state}-${seat}`))
    .map((seat) => `HOUSE${state}${seat === '00' ? 'AL' : Number(seat)}-26`));
  const seats = await mapLimit(seatTickers, 3, async (ticker) => {
    const body = await getJson<{ event?: KalshiEvent }>(`${restUrl}/events/${ticker}?with_nested_markets=true`);
    const seat = parseHouseEventTicker(ticker);
    return body?.event?.event_ticker === ticker && seat ? usable(body.event, 'HOUSE_DISTRICT', seat.stateCode, seat.district) : [];
  });
  markets.push(...seats.flat());

  return { markets, failed, error };
}

/** A candidate in a race, from the ballot or an FEC filing, keyed by race (`CA-07`, `GA-SEN`). */
export interface RaceCandidateName {
  name: string;
  party: string | null;
}

/**
 * Candidate markets whose tickers carry no `-D`/`-R` (`KXCAELECTION-2607` lists two Democrats by
 * name) get their party from a "(D)"/"(R)" tag in the name, or else from the race's candidate
 * with that name. Anyone else, independents included, keeps a null party.
 */
export function assignParties(markets: CatalogMarket[], candidates: ReadonlyMap<string, RaceCandidateName[]>): CatalogMarket[] {
  return markets.map((market) => {
    if (market.party || (market.scope !== 'HOUSE_DISTRICT' && market.scope !== 'STATE_SENATE')) return market;
    const tag = /\((D|R)\)/.exec(market.outcome)?.[1] as 'D' | 'R' | undefined;
    const party = tag ?? majorParty(matchName(market.outcome, candidates.get(market.race) ?? [])?.party);
    return party ? { ...market, party } : market;
  });
}
