import { useEffect, useSyncExternalStore } from "react";
import { API_BASE_URL } from "@/lib/apiBase";

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
interface Store {
  status: KalshiFeedStatus;
  markets: Map<string, KalshiMarket>;
  byRace: Map<string, KalshiMarket[]>;
  /** When this browser last heard from the stream while it was live (epoch ms); null if it never was. Prices are from then. */
  liveAt: number | null;
  /** When the feed last stopped being live (epoch ms); null while live or before it ever was. */
  notLiveSince: number | null;
}

const STREAM_URL = `${API_BASE_URL}/api/prediction-markets/kalshi/stream`;
const CLOSE_DELAY_MS = 5_000;

let store: Store = { status: "connecting", markets: new Map(), byRace: new Map(), liveAt: null, notLiveSince: Date.now() };
const listeners = new Set<() => void>();
let source: EventSource | null = null;
let users = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let retryPending = false;
let watchdogOn = false;
let lastReopenAt = 0;
let watchdogTimer: ReturnType<typeof setInterval> | undefined;
/** Waits before reopening a stream the browser gave up on: 2 s, 4 s, 8 s … up to 60 s. */
export const reconnectDelayMs = (attempt: number) => Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5));

function groupByRace(markets: Map<string, KalshiMarket>) {
  const byRace = new Map<string, KalshiMarket[]>();
  for (const market of markets.values()) byRace.set(market.race, [...(byRace.get(market.race) ?? []), market]);
  // Stable order (D, R, then others) so rows don't jump around as prices tick.
  const rank = (market: KalshiMarket) => (market.party === "D" ? 0 : market.party === "R" ? 1 : 2);
  for (const list of byRace.values()) list.sort((a, b) => rank(a) - rank(b) || a.outcome.localeCompare(b.outcome));
  return byRace;
}

function setStore(next: Partial<Store>) {
  const status = next.status ?? store.status;
  const now = Date.now();
  if (status === "live") next = { ...next, liveAt: now, notLiveSince: null };
  else if (store.status === "live" || store.notLiveSince === null) next = { ...next, notLiveSince: now };
  store = { ...store, ...next };
  if (next.markets) store.byRace = groupByRace(next.markets);
  listeners.forEach((listener) => listener());
}

function parse<T>(event: MessageEvent): T | null {
  try { return JSON.parse(event.data) as T; } catch { return null; }
}

function open() {
  if (source || typeof EventSource === "undefined") return;
  const stream = new EventSource(STREAM_URL);
  source = stream;
  stream.addEventListener("snapshot", (event) => {
    retries = 0;
    const board = parse<{ status: KalshiFeedStatus; markets: KalshiMarket[] }>(event as MessageEvent);
    if (board) setStore({ status: board.status, markets: new Map(board.markets.map((market) => [market.ticker, market])) });
  });
  stream.addEventListener("quotes", (event) => {
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
  stream.addEventListener("status", (event) => {
    const body = parse<{ status: KalshiFeedStatus }>(event as MessageEvent);
    if (body) setStore({ status: body.status });
  });
  // EventSource reconnects on its own after a dropped connection, and the server resends a snapshot when it does.
  // After an HTTP error (a 502 while the backend redeploys, a 429) the browser closes the stream for good, so open a
  // new one after a backoff instead of leaving the feed offline until the page is reloaded.
  stream.onerror = () => {
    if (store.status !== "offline") setStore({ status: "offline" });
    if (stream.readyState !== EventSource.CLOSED || source !== stream) return;
    source = null;
    clearTimeout(retryTimer);
    retryPending = true;
    retryTimer = setTimeout(() => { retryPending = false; if (users > 0) open(); }, reconnectDelayMs(retries++));
  };
}

/** How long the feed may sit offline with no open stream before the health check opens a fresh one. */
export const WATCHDOG_STUCK_MS = 30_000;
const WATCHDOG_EVERY_MS = 15_000;

/**
 * Whether the health check should replace the stream: the feed is offline, has been for a while, no reconnect is
 * already scheduled, and the stream isn't open. An open stream whose server says "degraded" is left alone: the
 * server pushes the recovery, and reopening every viewer's stream would resend the whole board to each of them.
 */
export function shouldReopen(state: { status: KalshiFeedStatus; notLiveSince: number | null }, readyState: number | null, pending: boolean, now: number) {
  if (state.status !== "offline" || pending || state.notLiveSince === null) return false;
  if (readyState === 1 /* OPEN */) return false;
  return now - state.notLiveSince >= WATCHDOG_STUCK_MS;
}

function checkHealth() {
  if (!watchdogOn || users === 0 || typeof EventSource === "undefined") return;
  // A stream that stays down is replaced every WATCHDOG_STUCK_MS, not on every check.
  const since = store.notLiveSince === null ? null : Math.max(store.notLiveSince, lastReopenAt);
  if (!shouldReopen({ status: store.status, notLiveSince: since }, source ? source.readyState : null, retryPending, Date.now())) return;
  source?.close();
  source = null;
  lastReopenAt = Date.now();
  open();
}

function onVisible() {
  if (document.visibilityState === "visible") checkHealth();
}

/**
 * Turns the stream health check on or off: every 15 seconds, and whenever the tab comes back into view, it opens a
 * fresh stream if the feed has been offline for 30 seconds with nothing reconnecting it.
 */
export function setKalshiWatchdog(on: boolean) {
  if (on === watchdogOn) return;
  watchdogOn = on;
  clearInterval(watchdogTimer);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  if (!on) return;
  watchdogTimer = setInterval(checkHealth, WATCHDOG_EVERY_MS);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
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
      if (users === 0) closeTimer = setTimeout(() => { clearTimeout(retryTimer); retryPending = false; source?.close(); source = null; }, CLOSE_DELAY_MS);
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
