import { createHash } from 'node:crypto';
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
});

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
  return respondFromDatabase(req, res, () => dbBootstrapPayload(prisma, readModelConfig()), { status: 503, body: NO_SOURCE });
});

export function mockCurrentResult(contestId: string) {
  return mockElectionResultsFixtures.find((item) =>
    item.data?.contest.id === contestId || item.meta.request.contestId === contestId
  );
}

router.get('/contests/:id/results/current', (req, res) => {
  if (fromDatabase()) {
    return respondFromDatabase(req, res, () => dbCurrentResult(prisma, readModelConfig(), req.params.id), {
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
  return respondFromDatabase(req, res, () => dbSourceStatusPayload(prisma, readModelConfig()), { status: 503, body: NO_SOURCE });
});

export default router;
