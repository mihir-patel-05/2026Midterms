import { createHash } from 'node:crypto';
import compression from 'compression';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import {
  mockElectionResultsFixtures,
  mockPartialSenateResultsFixture,
} from '../features/election-results/fixtures.js';
import type { ResponseMetadata } from '../features/election-results/contracts.js';
import {
  dbBootstrapPayload,
  dbCurrentResult,
  dbSourceStatusPayload,
  type ReadModelConfig,
} from '../features/election-results/read-model.js';

const router = Router();
const fromDatabase = () => env.RESULTS_READ_SOURCE === 'database';
const visible = () => env.FEATURE_ELECTION_DASHBOARD && (
  fromDatabase()
    ? env.RESULTS_PROVIDER_MOCK_ENABLED || env.RESULTS_PROVIDER_ENABLED_IDS.length > 0
    : env.RESULTS_PROVIDER_MOCK_ENABLED
);

const readModelConfig = (): ReadModelConfig => ({
  mockEnabled: env.RESULTS_PROVIDER_MOCK_ENABLED,
  enabledProviderKeys: env.RESULTS_PROVIDER_ENABLED_IDS,
  staleAfterSeconds: env.RESULTS_STALE_AFTER_SECONDS,
  showTestData: env.CIVICAPI_ACCEPT_TEST_DATA,
});

/**
 * Database reads are cached for 10 seconds per URL, so election-night traffic costs one read per
 * route every 10 seconds however many browsers poll. ETags still let browsers skip the body.
 */
export const RESULTS_CACHE_MS = 10_000;
interface CachedRead { at: number; promise: Promise<unknown> }
const readCache = new Map<string, CachedRead>();

export function cachedRead(key: string, load: () => Promise<unknown>, now = Date.now()): Promise<unknown> {
  const hit = readCache.get(key);
  if (hit && now - hit.at < RESULTS_CACHE_MS) return hit.promise;
  const promise = load();
  readCache.set(key, { at: now, promise });
  // A failed read is not cached, so the next request tries again.
  promise.catch(() => {
    if (readCache.get(key)?.promise === promise) readCache.delete(key);
  });
  if (readCache.size > 1000) readCache.clear();
  return promise;
}

export function clearResultsCache() {
  readCache.clear();
}

export function etagFor(body: unknown) {
  return `"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}"`;
}

/** ETag that ignores per-request generatedAt stamps, so unchanged DB results still revalidate. */
export function stableEtagFor(body: unknown) {
  const stable = JSON.stringify(body, (key, value) => (key === 'generatedAt' ? undefined : value));
  return `"${createHash('sha256').update(stable).digest('hex')}"`;
}

function respond(req: Request, res: Response, body: unknown, etag = etagFor(body)) {
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.json(body);
}

function metadata(request: ResponseMetadata['request'] = {}): ResponseMetadata {
  return {
    ...mockPartialSenateResultsFixture.meta,
    request,
    limitations: [
      'All results are fictional mock fixtures; no live election provider is connected.',
      'The state map is a temporary cartogram pending a selected Census geography vintage.',
    ],
  };
}

router.use((_req, res, next) => {
  if (!visible()) return res.status(404).json({ error: 'Not Found' });
  next();
});
// A bootstrap of every race is large and repetitive; it compresses about tenfold.
router.use(compression());

export function mockBootstrapPayload() {
  return {
    data: {
      manifest: {
        version: 'mock-v1',
        states: [{ code: 'EX', name: 'Fictional Example State', coverage: 'PARTIAL' as const }],
      },
      results: mockElectionResultsFixtures,
    },
    meta: metadata(),
  };
}

const NO_SOURCE = { error: 'No results source is available' };

async function respondFromDatabase(
  req: Request,
  res: Response,
  load: () => Promise<unknown>,
  missing: { status: number; body: { error: string } }
) {
  try {
    const body = await load();
    if (!body) return res.status(missing.status).json(missing.body);
    return respond(req, res, body, stableEtagFor(body));
  } catch (error) {
    console.error('[results] Failed to read results from the database:', error);
    return res.status(503).json({ error: 'Results temporarily unavailable' });
  }
}

router.get('/bootstrap', (req, res) => {
  if (!fromDatabase()) return respond(req, res, mockBootstrapPayload());
  // `?units=none` leaves out counties, which come from /contests/:id/results/current for one race.
  const includeUnits = req.query.units !== 'none';
  return respondFromDatabase(req, res, () => cachedRead(`bootstrap:${includeUnits}`, () => dbBootstrapPayload(prisma, readModelConfig(), new Date(), { includeUnits })), { status: 503, body: NO_SOURCE });
});

export function mockCurrentResult(contestId: string) {
  return mockElectionResultsFixtures.find((item) =>
    item.data?.contest.id === contestId || item.meta.request.contestId === contestId
  );
}

router.get('/contests/:id/results/current', (req, res) => {
  if (fromDatabase()) {
    return respondFromDatabase(req, res, () => cachedRead(`contest:${req.params.id}`, () => dbCurrentResult(prisma, readModelConfig(), req.params.id)), {
      status: 404, body: { error: 'Contest not found' },
    });
  }
  const result = mockCurrentResult(req.params.id);
  if (!result) return res.status(404).json({ error: 'Contest not found in mock fixtures' });
  respond(req, res, result);
});

export function mockSourceStatusPayload() {
  const sources = [mockPartialSenateResultsFixture.meta.source];
  return { data: { sources }, meta: metadata() };
}

router.get('/sources/status', (req, res) => {
  if (!fromDatabase()) return respond(req, res, mockSourceStatusPayload());
  return respondFromDatabase(req, res, () => cachedRead('sources', () => dbSourceStatusPayload(prisma, readModelConfig())), { status: 503, body: NO_SOURCE });
});

export default router;
