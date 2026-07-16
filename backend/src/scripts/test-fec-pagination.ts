#!/usr/bin/env tsx

export {};

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.FEC_API_KEY ??= 'test-key';
process.env.GEMINI_API_KEY ??= 'test-key';

const { FECClient } = await import('../config/fec-client.js');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`✅ ${message}`);
}

type StubRow = { id: string };
type StubResponse = {
  data: {
    api_version: string;
    results: StubRow[];
    pagination: {
      count: number;
      pages: number;
      per_page: number;
      last_indexes?: Record<string, string>;
    };
  };
};

const client = new FECClient();
const requestedCursors: Array<string | undefined> = [];

(client as unknown as {
  get: (_endpoint: string, config: { params: Record<string, unknown> }) => Promise<StubResponse>;
}).get = async (_endpoint, config) => {
  const cursor = config.params.last_index as string | undefined;
  requestedCursors.push(cursor);

  const page = cursor === undefined
    ? { results: [{ id: 'a' }], last_indexes: { last_index: 'a', last_date: '2026-07-03' } }
    : cursor === 'a'
      ? { results: [{ id: 'b' }], last_indexes: { last_index: 'b', last_date: '2026-07-02' } }
      : cursor === 'b'
        ? { results: [{ id: 'c' }], last_indexes: undefined }
        : { results: [], last_indexes: undefined };

  return {
    data: {
      api_version: '1.0',
      results: page.results,
      pagination: {
        count: 3,
        pages: 3,
        per_page: 100,
        last_indexes: page.last_indexes,
      },
    },
  };
};

const firstBatch = await client.getKeysetBatch<StubRow>('/schedule/', {}, 2);
assert(firstBatch.results.map((row) => row.id).join(',') === 'a,b', 'bounded batch follows returned cursors');
assert(firstBatch.exhausted === false, 'page cap reports an incomplete backfill');
assert(firstBatch.nextCursor?.last_index === 'b', 'batch returns a resumable cursor');
assert(requestedCursors.join(',') === ',a', 'second request uses the first page cursor');

const resumed = await client.getKeysetBatch<StubRow>(
  '/schedule/',
  {},
  2,
  firstBatch.nextCursor ?? {},
);
assert(resumed.results.map((row) => row.id).join(',') === 'c', 'saved cursor resumes at the next unseen row');
assert(resumed.exhausted === true, 'missing final cursor marks the backfill complete');
assert(resumed.nextCursor === null, 'completed backfill clears its cursor');

const stalled = new FECClient();
(stalled as unknown as {
  get: () => Promise<StubResponse>;
}).get = async () => ({
  data: {
    api_version: '1.0',
    results: [{ id: 'same' }],
    pagination: {
      count: 2,
      pages: 2,
      per_page: 100,
      last_indexes: { last_index: 'same' },
    },
  },
});

let rejectedStalledCursor = false;
try {
  await stalled.getKeysetBatch<StubRow>('/schedule/', {}, 2, { last_index: 'same' });
} catch {
  rejectedStalledCursor = true;
}
assert(rejectedStalledCursor, 'non-advancing cursors fail instead of looping');

console.log('\nAll FEC keyset pagination tests passed.');
