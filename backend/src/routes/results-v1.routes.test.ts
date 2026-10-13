import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ElectionResultsResponseSchema } from '../features/election-results/contracts.js';

test('mock API builders return valid normalized fixtures with stable ETags', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  process.env.FEC_API_KEY ||= 'fixture-test';
  process.env.GEMINI_API_KEY ||= 'fixture-test';
  const { mockBootstrapPayload, mockCurrentResult, mockSourceStatusPayload, etagFor } = await import('./results-v1.routes.js');
  const payload = mockBootstrapPayload();
  assert.equal(payload.meta.contractVersion, '1.0.0');
  assert.equal(payload.meta.isMockData, true);
  assert.equal(payload.data.results.length, 5);
  for (const result of payload.data.results) {
    ElectionResultsResponseSchema.parse(result);
    const contestId = result.data?.contest.id ?? result.meta.request.contestId;
    assert(contestId);
    assert.deepEqual(mockCurrentResult(contestId), result);
  }
  assert.equal(mockSourceStatusPayload().data.sources[0].isMock, true);
  assert.equal(etagFor(payload), etagFor(mockBootstrapPayload()));
  assert.notEqual(etagFor(payload), etagFor(mockSourceStatusPayload()));
});

test('stable ETags ignore per-request generatedAt stamps but track data changes', async () => {
  const { stableEtagFor } = await import('./results-v1.routes.js');
  const body = (generatedAt: string, votes: number) => ({ data: { votes }, meta: { generatedAt } });
  assert.equal(stableEtagFor(body('2026-11-04T02:00:00.000Z', 1)), stableEtagFor(body('2026-11-04T02:05:00.000Z', 1)));
  assert.notEqual(stableEtagFor(body('2026-11-04T02:00:00.000Z', 1)), stableEtagFor(body('2026-11-04T02:00:00.000Z', 2)));
});
