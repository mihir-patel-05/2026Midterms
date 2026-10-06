import { Router } from 'express';
import { getPredictionMarkets, isStateCode } from '../services/prediction-markets.service.js';
import { kalshiLiveFeed, type FeedStatus, type PriceDelta } from '../services/kalshi/live-feed.js';

const router = Router();
const MAX_STREAM_CLIENTS = 2000;
const STREAM_PING_MS = 20_000;
let streamClients = 0;

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
  streamClients++;
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
  });
});

router.get('/', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : null;
  const district = typeof req.query.district === 'string' ? req.query.district.padStart(2, '0') : null;
  if (state !== null && !isStateCode(state)) return res.status(400).json({ error: 'Invalid state' });
  if (district !== null && (!state || !/^(0[1-9]|[1-4][0-9]|5[0-3])$/.test(district))) {
    return res.status(400).json({ error: 'District requires a state and a number from 1 to 53' });
  }
  try {
    res.json(await getPredictionMarkets(state, district));
  } catch {
    res.status(503).json({ error: 'Prediction markets unavailable' });
  }
});

export default router;
