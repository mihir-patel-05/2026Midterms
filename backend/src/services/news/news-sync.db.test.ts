import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import type { PickerClient } from '../../agents/top-stories.js';
import { NewsSearchError, type NewsSearchClient, type NewsSearchRequest } from './apify-client.js';
import { pruneAgentRuns, syncNews, type NewsSyncOptions } from './news-sync.js';
import { apifyItems, NEWS_NOW } from './test-fixtures.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A source key no real sync uses, so the test never touches real rows.
const SOURCE_KEY = 'apify-google-news-test';
const MODEL = 'test-model-news-sync';

function fakeSearch(result: unknown[] | Error, costUsd: number | null = 0.05) {
  const requests: NewsSearchRequest[] = [];
  const client: NewsSearchClient = {
    actorId: 'test/google-news',
    async search(request) {
      requests.push(request);
      if (result instanceof Error) throw result;
      return { items: result, actorId: 'test/google-news', runId: 'run-1', status: 'SUCCEEDED', costUsd };
    },
  };
  return { client, requests };
}

test('a news run stores only the top stories, replaces them, and keeps them through failures', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const cleanup = async () => {
    await db.newsStory.deleteMany({ where: { ingestionRun: { source: { key: SOURCE_KEY } } } });
    await db.ingestionRun.deleteMany({ where: { source: { key: SOURCE_KEY } } });
    await db.dataSource.deleteMany({ where: { key: SOURCE_KEY } });
    await db.agentRun.deleteMany({ where: { agent: 'TOP_STORIES', model: MODEL } });
  };
  const stories = () => db.newsStory.findMany({ where: { ingestionRun: { source: { key: SOURCE_KEY } } }, orderBy: { rank: 'asc' } });
  const base = (search: NewsSearchClient, overrides: Partial<NewsSyncOptions> = {}): NewsSyncOptions => ({
    search,
    picker: null,
    pickerModel: MODEL,
    limit: 12,
    resultsPerQuery: 25,
    pricePer1000Usd: 2,
    budget: { dailyUsd: 10, totalUsd: 180 },
    now: NEWS_NOW,
    sourceKey: SOURCE_KEY,
    log: () => {},
    ...overrides,
  });

  try {
    await cleanup();

    // 1. Code ranking: political stories only, the three-outlet story first.
    const first = fakeSearch(apifyItems());
    const ranked = await syncNews(db, base(first.client));
    assert.equal(ranked.status, 'SUCCEEDED');
    assert.equal(ranked.method, 'RANKED');
    assert.equal(first.requests[0].maxItems, 200);
    assert.equal(first.requests[0].maxItemsPerQuery, 25);
    assert(first.requests[0].queries.every((query) => query.endsWith('when:1d')));
    let rows = await stories();
    assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 4]);
    assert.equal(rows[0].headline, 'Supreme Court agrees to hear mail ballot deadline case');
    assert.equal(rows[0].outlet, 'Wireone');
    assert.equal(rows[0].url, 'https://wireone.com/supreme-court-agrees-to-hear-mail-ballot-deadline-case');
    assert.equal(rows[0].outletCount, 3);
    assert.equal(rows[0].topic, 'COURTS');
    assert.equal(rows[0].selectedBy, 'RANKED');
    assert.deepEqual((rows[0].alsoCoveredBy as Array<{ outlet: string }>).map((item) => item.outlet), ['Dailytwo', 'Postthree']);
    assert(!rows.some((row) => row.headline.includes('championship')));
    const run = await db.ingestionRun.findUniqueOrThrow({ where: { id: ranked.ingestionRunId } });
    const metadata = run.metadata as Record<string, unknown>;
    assert.equal(metadata.costUsd, 0.05);
    assert.equal(metadata.method, 'RANKED');
    assert.equal(run.recordsFetched, 7);
    assert.equal(run.recordsAccepted, 4);

    // 2. The agent picks two; the list is replaced, not appended.
    const candidates = ['c1', 'c2'];
    const picker: PickerClient = {
      async pick() {
        return { output: { picks: candidates.map((id) => ({ id, topic: 'CONGRESS', stateCode: 'pa', sameStoryAs: [] })) }, model: MODEL, inputTokens: 10, outputTokens: 5 };
      },
    };
    const picked = await syncNews(db, base(fakeSearch(apifyItems()).client, { picker }));
    assert.equal(picked.method, 'AI');
    rows = await stories();
    assert.equal(rows.length, 2);
    assert(rows.every((row) => row.selectedBy === 'AI' && row.stateCode === 'PA' && row.agentRunId));

    // 3. A failed search, an empty result, and an exhausted budget leave the list alone.
    const failed = await syncNews(db, base(fakeSearch(new NewsSearchError('Apify run x ended FAILED', 'x')).client));
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.costUsd, 0.48, 'a started run counts its cap against the budget');
    const empty = await syncNews(db, base(fakeSearch([]).client));
    assert.equal(empty.status, 'FAILED');
    assert.match(empty.reason!, /previous list stays up/);
    const broke = fakeSearch(apifyItems());
    const skipped = await syncNews(db, base(broke.client, { budget: { dailyUsd: 0.6, totalUsd: 180 } }));
    assert.equal(skipped.status, 'SKIPPED');
    assert.equal(broke.requests.length, 0, 'no Apify call when over budget');
    assert.equal((await db.ingestionRun.findUniqueOrThrow({ where: { id: skipped.ingestionRunId } })).status, 'CANCELLED');
    assert.equal((await stories()).length, 2);

    // 4. Agent runs older than 30 days are pruned.
    const old = await db.agentRun.create({
      data: { agent: 'TOP_STORIES', model: MODEL, promptVersion: 'old', schemaVersion: 'old', status: 'SUCCEEDED', inputSha256: 'old', input: {}, createdAt: new Date('2026-09-01T00:00:00Z') },
    });
    assert(await pruneAgentRuns(db, NEWS_NOW) >= 1);
    assert.equal(await db.agentRun.findUnique({ where: { id: old.id } }), null);
  } finally {
    await cleanup();
    await db.$disconnect();
  }
});
