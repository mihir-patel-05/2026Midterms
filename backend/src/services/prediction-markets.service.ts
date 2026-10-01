/** Public, read-only 2026 general-election market quotes. */
export type MarketScope = 'NATIONAL_HOUSE' | 'NATIONAL_SENATE' | 'STATE_SENATE' | 'HOUSE_DISTRICT';
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

interface KalshiMarket {
  ticker?: string;
  title?: string;
  yes_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
}
interface KalshiEvent { event_ticker?: string; title?: string; markets?: KalshiMarket[] }
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

const KALSHI_API = 'https://external-api.kalshi.com/trade-api/v2';
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

function validPrice(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price < 1 ? price : null;
}

function partyFromKalshiTicker(ticker: string): string | null {
  if (ticker.endsWith('-D')) return 'Democratic Party';
  if (ticker.endsWith('-R')) return 'Republican Party';
  return null;
}

async function kalshiQuotes(ticker: string, scope: MarketScope, fetchedAt: string): Promise<MarketQuote[]> {
  const event = await getJson<{ event?: KalshiEvent }>(`${KALSHI_API}/events/${ticker}?with_nested_markets=true`);
  if (!event?.event || event.event.event_ticker !== ticker) return [];
  const title = event.event.title || ticker;
  return (event.event.markets || []).flatMap((market) => {
    if (market.status !== 'active' && market.status !== 'open') return [];
    const outcome = market.yes_sub_title || partyFromKalshiTicker(market.ticker || '') || market.title;
    if (!outcome) return [];
    const bid = validPrice(market.yes_bid_dollars);
    const ask = validPrice(market.yes_ask_dollars);
    const midpoint = bid !== null && ask !== null && bid <= ask ? (bid + ask) / 2 : null;
    const price = midpoint ?? validPrice(market.last_price_dollars);
    if (price === null) return [];
    return [{
      provider: 'KALSHI' as const, scope, eventTitle: title, outcome,
      pricePercent: Math.round(price * 1000) / 10,
      priceType: midpoint === null ? 'LAST_TRADE' as const : 'MIDPOINT' as const,
      url: market.ticker
        ? `https://kalshi.com/markets_by_ticker/${encodeURIComponent(market.ticker.toLowerCase())}`
        : `https://kalshi.com/markets/${ticker.split('-')[0].toLowerCase()}/-/${ticker.toLowerCase()}`,
      fetchedAt,
    }];
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

const stateNames: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky',
  LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
  MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};
export function isStateCode(code: string): boolean { return code in stateNames; }

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
