import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { marketHistoryEnabled } from "@/lib/featureFlags";

/** `[epoch ms of the captured hour, price in percent]`. Missing hours are absent, never zero. */
export type HistoryPoint = [number, number];

export interface MarketHistory {
  ticker: string;
  outcome: string;
  party: "D" | "R" | null;
  points: HistoryPoint[];
}

export interface MarketHistoryData {
  from: string;
  to: string;
  days: number;
  races: Array<{ race: string; markets: MarketHistory[] }>;
}

/** The API takes up to 60 races per request. */
const MAX_RACES = 60;

/**
 * Hourly Kalshi prices for a set of races (`US-HOUSE`, `PA-SEN`, `PA-07`, `DE-00`), in one request.
 * Snapshots are written once an hour, so a ten-minute stale time loses nothing.
 */
export function useMarketHistory(races: string[], days: number) {
  const keys = [...new Set(races)].sort().slice(0, MAX_RACES);
  return useQuery<MarketHistoryData, Error>({
    queryKey: ["election-monitor", "market-history", keys.join(","), days],
    enabled: marketHistoryEnabled && keys.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ race: keys.join(","), days: String(days) });
      const response = await fetch(`${API_BASE_URL}/api/prediction-markets/history?${query}`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body.data as MarketHistoryData;
    },
  });
}

/** Each market's history by ticker, for joining with live prices. */
export function historyByTicker(data: MarketHistoryData | undefined) {
  const byTicker = new Map<string, MarketHistory>();
  for (const race of data?.races ?? []) for (const market of race.markets) byTicker.set(market.ticker, market);
  return byTicker;
}

/** The earliest stored hour across the response, for "Hourly history since …" captions. */
export function historyStart(data: MarketHistoryData | undefined, tickers?: string[]) {
  let first = Infinity;
  for (const race of data?.races ?? []) {
    for (const market of race.markets) {
      if (tickers && !tickers.includes(market.ticker)) continue;
      if (market.points.length > 0) first = Math.min(first, market.points[0][0]);
    }
  }
  return Number.isFinite(first) ? first : null;
}
