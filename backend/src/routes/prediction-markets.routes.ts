import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { getPredictionMarkets, isStateCode } from '../services/prediction-markets.service.js';
import { kalshiLiveFeed, type FeedStatus, type PriceDelta } from '../services/kalshi/live-feed.js';
import { getMarketHistory, getMovers, parseRaceKey, type RaceRef } from '../services/kalshi/history.js';

const router = Router();
const MAX_STREAM_CLIENTS = 2000;
// The page shares one stream per tab; this leaves room for several tabs or a shared
// office IP, but stops one client from taking every slot.
const MAX_STREAM_CLIENTS_PER_IP = 10;
const STREAM_PING_MS = 20_000;
const DISTRICT_NUMBERS = Array.from({ length: 53 }, (_, index) => String(index + 1).padStart(2, '0'));
let streamClients = 0;
const streamClientsByIp = new Map<string, number>();

/** Every Kalshi market we track, with its latest price. */
router.get('/kalshi/board', (_req, res) => {
  res.set('Cache-Control', 'no-store').json(kalshiLiveFeed.snapshot());
});

/**
 * Server-Sent Events: `snapshot` (full board) on connect and whenever the catalog
 * gains markets, `quotes` (changed prices, at most once a second), and `status`.
 */
router.get('/kalshi/stream', (req, res) => {
  if (streamClients >= MAX_STREAM_CLIENTS) return res.status(503).json({ error: 'Too many live connections' });
  const ip = req.ip ?? 'unknown';
  const fromIp = streamClientsByIp.get(ip) ?? 0;
  if (fromIp >= MAX_STREAM_CLIENTS_PER_IP) return res.status(429).json({ error: 'Too many live connections from this address' });
  streamClients++;
  streamClientsByIp.set(ip, fromIp + 1);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onSnapshot = () => send('snapshot', kalshiLiveFeed.snapshot());
  const onQuotes = (quotes: PriceDelta[]) => send('quotes', quotes);
  const onStatus = (status: FeedStatus) => send('status', { status });
  res.write('retry: 5000\n\n');
  onSnapshot();
  kalshiLiveFeed.on('snapshot', onSnapshot);
  kalshiLiveFeed.on('quotes', onQuotes);
  kalshiLiveFeed.on('status', onStatus);
  const ping = setInterval(() => res.write(': ping\n\n'), STREAM_PING_MS);
  req.on('close', () => {
    clearInterval(ping);
    kalshiLiveFeed.off('snapshot', onSnapshot);
    kalshiLiveFeed.off('quotes', onQuotes);
    kalshiLiveFeed.off('status', onStatus);
    streamClients--;
    const remaining = (streamClientsByIp.get(ip) ?? 1) - 1;
    if (remaining > 0) streamClientsByIp.set(ip, remaining);
    else streamClientsByIp.delete(ip);
  });
});

const MAX_HISTORY_RACES = 60;

/** `race=PA-07,PA-SEN,US-HOUSE&days=14` */
export const historyQuery = z.object({
  race: z.string().transform((value, ctx) => {
    const keys = [...new Set(value.split(',').map((key) => key.trim().toUpperCase()).filter(Boolean))];
    if (keys.length === 0 || keys.length > MAX_HISTORY_RACES) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Give 1 to ${MAX_HISTORY_RACES} races` });
      return z.NEVER;
    }
    const refs: RaceRef[] = [];
    for (const key of keys) {
      const ref = parseRaceKey(key);
      if (!ref) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown race ${key}` });
        return z.NEVER;
      }
      refs.push(ref);
    }
    return refs;
  }),
  days: z.coerce.number().int().min(1).max(30).default(14),
});

/** `window=24h|7d&state=PA&limit=10` */
export const moversQuery = z.object({
  window: z.enum(['24h', '7d']).default('24h'),
  state: z.string().transform((value) => value.toUpperCase()).refine(isStateCode, 'Invalid state').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const SOURCE = { name: 'Kalshi', note: 'Hourly market prices from Kalshi. Traded prices, not forecasts or results. Hours with no stored price are gaps.' };

// Snapshots are written once an hour, so a five-minute cache loses nothing.
const cached = (res: Response) => res.set('Cache-Control', 'public, max-age=300');
const historyEnabled = (_req: Request, res: Response, next: NextFunction) => {
  if (!env.MARKET_HISTORY_ENABLED) return res.status(404).json({ error: 'Market history is turned off' });
  next();
};

/** GET /api/prediction-markets/history?race=PA-07,PA-SEN&days=14 */
router.get('/history', historyEnabled, async (req, res) => {
  const parsed = historyQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
  try {
    cached(res).json({ data: await getMarketHistory(prisma, parsed.data.race, parsed.data.days), source: SOURCE });
  } catch (error) {
    console.error('Market history failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Market history is unavailable' });
  }
});

/** GET /api/prediction-markets/movers?window=24h&state=PA&limit=10 */
router.get('/movers', historyEnabled, async (req, res) => {
  const parsed = moversQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
  try {
    cached(res).json({ data: await getMovers(prisma, parsed.data), source: SOURCE });
  } catch (error) {
    console.error('Market movers failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Market movers are unavailable' });
  }
});

router.get('/', async (req, res) => {
  const rawState = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : null;
  const rawDistrict = typeof req.query.district === 'string' ? req.query.district.padStart(2, '0') : null;
  // Continue with our own copies of the checked values, so no client string reaches the Kalshi URL.
  const state = rawState === null ? null : knownStateCode(rawState);
  const district = rawDistrict === null ? null : DISTRICT_NUMBERS.find((known) => known === rawDistrict) ?? null;
  if (rawState !== null && !state) return res.status(400).json({ error: 'Invalid state' });
  if (rawDistrict !== null && (!state || !district)) {
    return res.status(400).json({ error: 'District requires a state and a number from 1 to 53' });
  }
  try {
    res.json(await getPredictionMarkets(state, district));
  } catch {
    res.status(503).json({ error: 'Prediction markets unavailable' });
  }
});

export default router;
