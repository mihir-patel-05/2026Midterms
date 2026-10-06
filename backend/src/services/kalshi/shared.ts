/** Kalshi parsing shared by the REST quote fallback and the live WebSocket feed. */
export type MarketScope = 'NATIONAL_HOUSE' | 'NATIONAL_SENATE' | 'STATE_SENATE' | 'HOUSE_DISTRICT';
export type PriceType = 'MIDPOINT' | 'LAST_TRADE';

export interface KalshiMarket {
  ticker?: string;
  title?: string;
  yes_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
}
export interface KalshiEvent { event_ticker?: string; title?: string; markets?: KalshiMarket[] }

export const stateNames: Record<string, string> = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DE:'Delaware',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky',
  LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
  MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania',
  RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};
export function isStateCode(code: string): boolean { return code in stateNames; }

/** A dollar price strictly inside (0, 1); 0 and 1 mean no quote or a settled market. */
export function validPrice(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price < 1 ? price : null;
}

/** Bid/ask midpoint when the book is two-sided, otherwise the last trade. */
export function quotePrice(bid: unknown, ask: unknown, last: unknown): { pricePercent: number; priceType: PriceType } | null {
  const yesBid = validPrice(bid);
  const yesAsk = validPrice(ask);
  const midpoint = yesBid !== null && yesAsk !== null && yesBid <= yesAsk ? (yesBid + yesAsk) / 2 : null;
  const price = midpoint ?? validPrice(last);
  if (price === null) return null;
  return { pricePercent: Math.round(price * 1000) / 10, priceType: midpoint === null ? 'LAST_TRADE' : 'MIDPOINT' };
}

export function partyFromTicker(ticker: string): 'D' | 'R' | null {
  if (ticker.endsWith('-D')) return 'D';
  if (ticker.endsWith('-R')) return 'R';
  return null;
}

export const partyNames = { D: 'Democratic Party', R: 'Republican Party' } as const;

export function marketUrl(eventTicker: string, marketTicker?: string): string {
  return marketTicker
    ? `https://kalshi.com/markets_by_ticker/${encodeURIComponent(marketTicker.toLowerCase())}`
    : `https://kalshi.com/markets/${eventTicker.split('-')[0].toLowerCase()}/-/${eventTicker.toLowerCase()}`;
}

export function isOpen(market: KalshiMarket): boolean {
  return market.status === 'active' || market.status === 'open';
}
