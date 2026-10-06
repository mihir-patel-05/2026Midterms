import { useEffect, useSyncExternalStore } from "react";

/**
 * Live Kalshi prices pushed by the backend over Server-Sent Events. One EventSource
 * is shared by every component and closed shortly after the last one unmounts.
 */
export type KalshiFeedStatus = "disabled" | "connecting" | "live" | "degraded" | "offline";
export type KalshiScope = "NATIONAL_HOUSE" | "NATIONAL_SENATE" | "STATE_SENATE" | "HOUSE_DISTRICT";

export interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  eventTitle: string;
  scope: KalshiScope;
  /** `US-HOUSE`, `US-SENATE`, `GA-SEN`, or `PA-07` (`DE-00` at-large). */
  race: string;
  stateCode: string | null;
  district: string | null;
  outcome: string;
  party: "D" | "R" | null;
  url: string;
  pricePercent: number | null;
  priceType: "MIDPOINT" | "LAST_TRADE" | null;
  updatedAt: string;
  /** Direction of the last live move, for a brief highlight. */
  moved?: "up" | "down";
}

interface PriceDelta { ticker: string; pricePercent: number | null; priceType: KalshiMarket["priceType"]; updatedAt: string }
interface Store { status: KalshiFeedStatus; markets: Map<string, KalshiMarket>; byRace: Map<string, KalshiMarket[]> }

const STREAM_URL = `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/prediction-markets/kalshi/stream`;
const CLOSE_DELAY_MS = 5_000;

let store: Store = { status: "connecting", markets: new Map(), byRace: new Map() };
const listeners = new Set<() => void>();
let source: EventSource | null = null;
let users = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function groupByRace(markets: Map<string, KalshiMarket>) {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const market of markets.values()) byRace.set(market.race, [...(byRace.get(market.race) ?? []), market]);
  // Stable order (D, R, then others) so rows don't jump around as prices tick.
  const rank = (market: KalshiMarket) => (market.party === "D" ? 0 : market.party === "R" ? 1 : 2);
  for (const list of byRace.values()) list.sort((a, b) => rank(a) - rank(b) || a.outcome.localeCompare(b.outcome));
  return byRace;
}

function setStore(next: Partial<Store>) {
  store = { ...store, ...next };
  if (next.markets) store.byRace = groupByRace(next.markets);
  listeners.forEach((listener) => listener());
}

function parse<T>(event: MessageEvent): T | null {
  try { return JSON.parse(event.data) as T; } catch { return null; }
}

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource(STREAM_URL);
  source.addEventListener("snapshot", (event) => {
    const board = parse<{ status: KalshiFeedStatus; markets: KalshiMarket[] }>(event as MessageEvent);
    if (board) setStore({ status: board.status, markets: new Map(board.markets.map((market) => [market.ticker, market])) });
  });
  source.addEventListener("quotes", (event) => {
    const deltas = parse<PriceDelta[]>(event as MessageEvent);
    if (!deltas?.length) return;
    const markets = new Map(store.markets);
    for (const delta of deltas) {
      const market = markets.get(delta.ticker);
      if (!market) continue;
      const moved = market.pricePercent === null || delta.pricePercent === null || delta.pricePercent === market.pricePercent
        ? undefined
        : delta.pricePercent > market.pricePercent ? "up" : "down";
      markets.set(delta.ticker, { ...market, ...delta, moved });
    }
    setStore({ markets });
  });
  source.addEventListener("status", (event) => {
    const body = parse<{ status: KalshiFeedStatus }>(event as MessageEvent);
    if (body) setStore({ status: body.status });
  });
  // EventSource reconnects on its own; the server resends a snapshot when it does.
  source.onerror = () => { if (store.status !== "offline") setStore({ status: "offline" }); };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function useStore() {
  useEffect(() => {
    users++;
    clearTimeout(closeTimer);
    open();
    return () => {
      users--;
      if (users === 0) closeTimer = setTimeout(() => { source?.close(); source = null; }, CLOSE_DELAY_MS);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => store);
}

export function useKalshiStatus(): KalshiFeedStatus {
  return useStore().status;
}

export function useControlOdds() {
  const { status, byRace } = useStore();
  return { status, house: byRace.get("US-HOUSE") ?? [], senate: byRace.get("US-SENATE") ?? [] };
}

/** Markets for one contest; empty when Kalshi has none. */
export function useRaceOdds(stateCode: string | null | undefined, office: string | null | undefined, district: string | null | undefined) {
  const { status, byRace } = useStore();
  const race = !stateCode ? null : office === "US_SENATE" ? `${stateCode}-SEN` : office === "US_HOUSE" && district ? `${stateCode}-${district}` : null;
  return { status, markets: race ? byRace.get(race) ?? [] : [] };
}

/** Live Kalshi quotes for one event, for overlaying onto REST quotes. */
export function useKalshiMarkets() {
  return useStore();
}
