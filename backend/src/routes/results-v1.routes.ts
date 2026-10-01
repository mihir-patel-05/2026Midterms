import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import {
  mockElectionResultsFixtures,
  mockPartialSenateResultsFixture,
} from '../features/election-results/fixtures.js';
import type { ResponseMetadata } from '../features/election-results/contracts.js';

const router = Router();
const visible = () => env.FEATURE_ELECTION_DASHBOARD && env.RESULTS_PROVIDER_MOCK_ENABLED;

export function etagFor(body: unknown) {
  return `"${createHash('sha256').update(JSON.stringify(body)).digest('hex')}"`;
}

function respond(req: Request, res: Response, body: unknown) {
  const etag = etagFor(body);
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

router.get('/bootstrap', (req, res) => {
  respond(req, res, mockBootstrapPayload());
});

export function mockCurrentResult(contestId: string) {
  return mockElectionResultsFixtures.find((item) =>
    item.data?.contest.id === contestId || item.meta.request.contestId === contestId
  );
}

router.get('/contests/:id/results/current', (req, res) => {
  const result = mockCurrentResult(req.params.id);
  if (!result) return res.status(404).json({ error: 'Contest not found in mock fixtures' });
  respond(req, res, result);
});

export function mockSourceStatusPayload() {
  const sources = [mockPartialSenateResultsFixture.meta.source];
  return { data: { sources }, meta: metadata() };
}

router.get('/sources/status', (req, res) => {
  respond(req, res, mockSourceStatusPayload());
});

export default router;
