/**
 * One authenticated Kalshi WebSocket for the whole process. It subscribes to the
 * `ticker` channel for every market in the catalog, keeps the latest price per
 * market in memory, and emits coalesced changes for the SSE route to fan out.
 */
import { EventEmitter } from 'node:events';
import type { KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { env } from '../../config/env.js';
import { authHeaders, loadPrivateKey } from './auth.js';
import { buildCatalog, type CatalogMarket } from './catalog.js';
import { quotePrice, type PriceType } from './shared.js';
import { hourStart, writeMarketSnapshots, type SnapshotWriter } from './snapshots.js';

export type FeedStatus = 'disabled' | 'connecting' | 'live' | 'degraded';

export interface PriceDelta {
  ticker: string;
  pricePercent: number | null;
  priceType: PriceType | null;
  updatedAt: string;
}
export type BoardMarket = Omit<CatalogMarket, 'seed'> & Omit<PriceDelta, 'ticker'>;
export interface BoardSnapshot {
  status: FeedStatus;
  updatedAt: string;
  markets: BoardMarket[];
}

interface TickerMessage {
  market_ticker?: string;
  price_dollars?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  ts_ms?: number;
}
interface RawPrice { bid?: string; ask?: string; last?: string; delta: PriceDelta }

const SUBSCRIBE_CHUNK = 200;
const CATALOG_REFRESH_MS = 30 * 60_000;
const CATALOG_RETRY_MS = 5 * 60_000;
const HEARTBEAT_MS = 30_000;
const BROADCAST_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
// Checked often so an hour is still captured soon after a restart or reconnect.
const SNAPSHOT_CHECK_MS = 5 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
      if (response.status === 404) return null;
      if (response.ok) return response.json() as Promise<T>;
      if ((response.status !== 429 && response.status < 500) || attempt >= 3) throw new Error(`Kalshi REST returned ${response.status}`);
    } catch (error) {
      if (attempt >= 3 || (error instanceof Error && /returned 4\d\d/.test(error.message))) throw error;
    }
    await sleep(500 * 2 ** attempt);
  }
}

export class KalshiLiveFeed extends EventEmitter {
  status: FeedStatus = 'disabled';
  private catalog = new Map<string, CatalogMarket>();
  private prices = new Map<string, RawPrice>();
  private subscribed = new Set<string>();
  private pending = new Map<string, PriceDelta>();
  private socket: WebSocket | null = null;
  private keyId = '';
  private key: KeyObject | null = null;
  private nextCommandId = 1;
  private attempt = 0;
  private lastSeenAt = 0;
  private stopped = true;
  private timers = new Set<NodeJS.Timeout>();
  private capturedHour = 0;

  constructor(private readonly writeSnapshots: SnapshotWriter | null = writeMarketSnapshots) {
    super();
    // Every SSE client adds listeners.
    this.setMaxListeners(0);
  }

  async start(): Promise<void> {
    if (!env.KALSHI_LIVE_ENABLED) return;
    if (!env.KALSHI_API_KEY_ID || !(env.KALSHI_PRIVATE_KEY || env.KALSHI_PRIVATE_KEY_PATH)) {
      console.warn('⚠️  KALSHI_LIVE_ENABLED is true but KALSHI_API_KEY_ID or the private key is missing; live feed disabled.');
      return;
    }
    try {
      this.key = loadPrivateKey(env.KALSHI_PRIVATE_KEY, env.KALSHI_PRIVATE_KEY_PATH);
    } catch (error) {
      console.error('❌ Could not read the Kalshi private key; live feed disabled:', error instanceof Error ? error.message : error);
      return;
    }
    this.keyId = env.KALSHI_API_KEY_ID;
    this.stopped = false;
    this.setStatus('connecting');
    this.every(BROADCAST_MS, () => this.flush());
    this.every(HEARTBEAT_MS, () => this.heartbeat());
    if (env.KALSHI_SNAPSHOTS_ENABLED) this.every(SNAPSHOT_CHECK_MS, () => void this.captureHour());
    await this.refreshCatalog();
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.socket?.close();
    this.socket = null;
    this.setStatus('disabled');
  }

  snapshot(): BoardSnapshot {
    const markets = [...this.catalog.values()].map(({ seed: _seed, ...market }) => {
      const { ticker: _ticker, ...price } = this.prices.get(market.ticker)?.delta
        ?? { ticker: market.ticker, pricePercent: null, priceType: null, updatedAt: new Date(0).toISOString() };
      return { ...market, ...price };
    });
    return { status: this.status, updatedAt: new Date(this.lastSeenAt || Date.now()).toISOString(), markets };
  }

  /** Quotes for one Kalshi event while the socket is live; null means "ask REST instead". */
  eventQuotes(eventTicker: string): Array<BoardMarket & { pricePercent: number; priceType: PriceType }> | null {
    if (this.status !== 'live') return null;
    const markets = this.snapshot().markets.filter((market) => market.eventTicker === eventTicker);
    if (markets.length === 0) return null;
    return markets.filter((market): market is BoardMarket & { pricePercent: number; priceType: PriceType } =>
      market.pricePercent !== null && market.priceType !== null);
  }

  /** Applies one ticker update; exported for tests. Returns the change, if the shown price moved. */
  applyTicker(message: TickerMessage, now = Date.now()): PriceDelta | null {
    const ticker = message.market_ticker;
    if (!ticker || !this.catalog.has(ticker)) return null;
    const previous = this.prices.get(ticker);
    const raw = {
      bid: message.yes_bid_dollars ?? previous?.bid,
      ask: message.yes_ask_dollars ?? previous?.ask,
      last: message.price_dollars ?? previous?.last,
    };
    const quote = quotePrice(raw.bid, raw.ask, raw.last);
    const delta: PriceDelta = {
      ticker,
      pricePercent: quote?.pricePercent ?? null,
      priceType: quote?.priceType ?? null,
      updatedAt: new Date(message.ts_ms ?? now).toISOString(),
    };
    this.prices.set(ticker, { ...raw, delta });
    if (previous && previous.delta.pricePercent === delta.pricePercent && previous.delta.priceType === delta.priceType) return null;
    this.pending.set(ticker, delta);
    return delta;
  }

  /** Replaces the catalog and seeds prices for markets the socket has not priced yet; exported for tests. */
  setCatalog(markets: CatalogMarket[], now = Date.now()): string[] {
    const added = markets.filter((market) => !this.catalog.has(market.ticker)).map((market) => market.ticker);
    this.catalog = new Map(markets.map((market) => [market.ticker, market]));
    for (const ticker of this.prices.keys()) if (!this.catalog.has(ticker)) this.prices.delete(ticker);
    for (const market of markets) {
      if (this.prices.has(market.ticker)) continue;
      const quote = quotePrice(market.seed.bid, market.seed.ask, market.seed.last);
      this.prices.set(market.ticker, { ...market.seed, delta: {
        ticker: market.ticker, pricePercent: quote?.pricePercent ?? null, priceType: quote?.priceType ?? null,
        updatedAt: new Date(now).toISOString(),
      } });
    }
    return added;
  }

  /**
   * Writes this hour's prices to market_snapshots once per hour, only while the
   * socket is live so a stale board is never recorded as current. Returns rows written.
   */
  async captureHour(now = new Date()): Promise<number> {
    const hour = hourStart(now);
    if (!this.writeSnapshots || this.status !== 'live' || this.capturedHour >= hour.getTime()) return 0;
    this.capturedHour = hour.getTime();
    const inputs = [...this.catalog.values()].map(({ seed: _seed, ...market }) => {
      const { bid, ask, last } = this.prices.get(market.ticker) ?? {};
      return { market, bid, ask, last };
    });
    try {
      const written = await this.writeSnapshots(inputs, hour, now);
      // 0 after a restart mid-hour just means this hour was already stored.
      console.log(`🗂️  Kalshi snapshots: ${written} new markets for ${hour.toISOString()}${written === 0 ? ' (hour already stored or no priced markets)' : ''}`);
      return written;
    } catch (error) {
      this.capturedHour = 0; // Retry on the next check.
      console.error('⚠️  Kalshi snapshot write failed:', error instanceof Error ? error.message : error);
      return 0;
    }
  }

  private async refreshCatalog(): Promise<void> {
    let delay = CATALOG_REFRESH_MS;
    try {
      const markets = await buildCatalog(env.KALSHI_REST_URL, getJson);
      const added = this.setCatalog(markets);
      const races = new Set(markets.map((market) => market.race)).size;
      console.log(`📈 Kalshi catalog: ${markets.length} markets across ${races} races (${added.length} new)`);
      if (added.length > 0) {
        this.subscribe(added);
        this.emit('snapshot');
      }
    } catch (error) {
      // Keep the previous catalog; a partial one would drop races from the board.
      console.error('⚠️  Kalshi catalog refresh failed:', error instanceof Error ? error.message : error);
      delay = CATALOG_RETRY_MS;
    }
    if (!this.stopped) this.after(delay, () => void this.refreshCatalog());
  }

  private connect(): void {
    if (this.stopped || !this.key) return;
    let socket: WebSocket;
    try {
      const path = new URL(env.KALSHI_WS_URL).pathname;
      socket = new WebSocket(env.KALSHI_WS_URL, { headers: authHeaders(this.keyId, this.key, 'GET', path) });
    } catch (error) {
      console.error('❌ Could not open the Kalshi WebSocket:', error instanceof Error ? error.message : error);
      this.setStatus('degraded');
      this.after(MAX_BACKOFF_MS, () => this.connect());
      return;
    }
    this.socket = socket;
    this.subscribed.clear();

    socket.on('open', () => {
      this.attempt = 0;
      this.lastSeenAt = Date.now();
      this.subscribe([...this.catalog.keys()]);
      this.setStatus('live');
      console.log('📡 Kalshi WebSocket live');
    });
    socket.on('message', (data) => {
      this.lastSeenAt = Date.now();
      let message: { type?: string; msg?: TickerMessage & { code?: number; msg?: string } };
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.type === 'ticker' && message.msg) this.applyTicker(message.msg);
      else if (message.type === 'error') console.error('⚠️  Kalshi WebSocket error:', message.msg?.code, message.msg?.msg);
    });
    socket.on('pong', () => { this.lastSeenAt = Date.now(); });
    socket.on('unexpected-response', (_request, response) => {
      console.error(`❌ Kalshi WebSocket handshake rejected (${response.statusCode}); check KALSHI_API_KEY_ID and the private key.`);
      socket.terminate();
    });
    socket.on('error', (error) => console.error('⚠️  Kalshi WebSocket:', error.message));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.setStatus('degraded');
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++);
      this.after(backoff / 2 + Math.random() * (backoff / 2), () => this.connect());
    });
  }

  private subscribe(tickers: string[]): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const fresh = tickers.filter((ticker) => !this.subscribed.has(ticker));
    for (let index = 0; index < fresh.length; index += SUBSCRIBE_CHUNK) {
      const chunk = fresh.slice(index, index + SUBSCRIBE_CHUNK);
      socket.send(JSON.stringify({ id: this.nextCommandId++, cmd: 'subscribe', params: { channels: ['ticker'], market_tickers: chunk } }));
      chunk.forEach((ticker) => this.subscribed.add(ticker));
    }
  }

  private heartbeat(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastSeenAt > HEARTBEAT_MS * 2.5) {
      console.warn('⚠️  Kalshi WebSocket went quiet; reconnecting.');
      socket.terminate();
      return;
    }
    socket.ping();
  }

  private flush(): void {
    if (this.pending.size === 0) return;
    const deltas = [...this.pending.values()];
    this.pending.clear();
    this.emit('quotes', deltas);
  }

  private setStatus(status: FeedStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  private every(ms: number, run: () => void): void {
    const timer = setInterval(run, ms);
    timer.unref();
    this.timers.add(timer);
  }

  private after(ms: number, run: () => void): void {
    const timer = setTimeout(() => { this.timers.delete(timer); run(); }, ms);
    timer.unref();
    this.timers.add(timer);
  }
}

export const kalshiLiveFeed = new KalshiLiveFeed();

export function getLiveEventQuotes(eventTicker: string) {
  return kalshiLiveFeed.eventQuotes(eventTicker);
}
