import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import type { ApifyClient, ApifyRunResult } from './apify-client.js';
import { loadStoryArticles } from './news-store.js';
import { syncNews } from './news-sync.js';
import { rankStories } from './trending.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A source no real sync uses, so the test never touches real rows.
const SOURCE_KEY = 'apify-google-news-test';
const limits = { dailyUsd: 8, totalUsd: 100, pricePer1000Usd: 2, maxItemsPerRun: 200 };

function fakeClient(batches: unknown[][], seen: Array<{ input: Record<string, unknown>; maxItems: number }>): Pick<ApifyClient, 'runActor'> {
  return {
    runActor: async (_actorId, input, runLimits) => {
      seen.push({ input, maxItems: runLimits.maxItems });
      const items = batches.shift() ?? [];
      return { run: { id: `run-${seen.length}`, status: 'SUCCEEDED', defaultDatasetId: 'ds', usageTotalUsd: 0.05 }, items, aborted: false } satisfies ApifyRunResult;
    },
  };
}

async function cleanup(db: PrismaClient) {
  const source = await db.dataSource.findUnique({ where: { key: SOURCE_KEY } });
  if (!source) return;
  await db.article.deleteMany({ where: { sourceId: source.id } });
  await db.ingestionRun.deleteMany({ where: { sourceId: source.id } });
  await db.dataSource.delete({ where: { id: source.id } });
}

test('news sync stores articles once, refreshes repeats, ranks stories, and stops at the budget', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await cleanup(db);
  const seen: Array<{ input: Record<string, unknown>; maxItems: number }> = [];
  const first = [
    { title: 'Georgia Senate debate turns on the economy - AP News', publisher: 'AP News', url: 'https://apnews.com/ga-debate', publishedAt: '2026-10-28T10:00:00Z', topic: 'NATION', position: 2, relatedArticles: [{ title: 'Georgia debate takeaways', publisher: 'Fox News', link: 'https://www.foxnews.com/ga' }] },
    { title: 'Georgia Senate debate turns on the economy - AP News', publisher: 'AP News', url: 'https://apnews.com/ga-debate?utm_source=g', publishedAt: '2026-10-28T10:00:00Z', query: 'Senate race when:1d' },
    { title: 'Celebrity wedding photos', publisher: 'Gossip Daily', url: 'https://gossip.example/w', publishedAt: '2026-10-28T09:00:00Z', topic: 'NATION', position: 1 },
    { title: 'Missing time', publisher: 'NPR', url: 'https://npr.org/x', topic: 'NATION' },
  ];
  const second = [
    { title: 'Georgia Senate debate turns on the economy - AP News', publisher: 'AP News', url: 'https://apnews.com/ga-debate', publishedAt: '2026-10-28T10:00:00Z', topic: 'NATION', position: 5 },
    { title: 'Georgia debate takeaways - Fox News', publisher: 'Fox News', url: 'https://www.foxnews.com/ga', publishedAt: '2026-10-28T11:00:00Z', query: 'Senate race when:1d' },
  ];
  const client = fakeClient([first, second], seen);
  const run = (now: string, runLimits = limits) => syncNews(db, client, { actorId: 'tacps126/google-news', limits: runLimits, sourceKey: SOURCE_KEY, now: new Date(now), log: () => {} });
  try {
    const one = await run('2026-10-28T12:00:00Z');
    assert.equal(one.status, 'SUCCEEDED');
    assert.equal(one.fetched, 4);
    assert.equal(one.inserted, 2);
    assert.deepEqual(one.rejected, { no_time: 1 });
    assert.equal(seen[0].maxItems, 200);
    const stored = await db.article.findFirstOrThrow({ where: { source: { key: SOURCE_KEY }, outletKey: 'apnews' } });
    assert.deepEqual(stored.foundBy.sort(), ['search:Senate race', 'topic:NATION']);
    assert.equal(stored.feedPosition, 2);

    const two = await run('2026-10-28T14:00:00Z');
    assert.equal(two.inserted, 1);
    assert.equal(two.updated, 1);
    const refreshed = await db.article.findUniqueOrThrow({ where: { id: stored.id } });
    assert.equal(refreshed.feedPosition, 5);
    assert.equal(refreshed.lastSeenAt.toISOString(), '2026-10-28T14:00:00.000Z');
    assert.equal(await db.article.count({ where: { source: { key: SOURCE_KEY } } }), 3);

    const stories = rankStories(await loadStoryArticles(db, SOURCE_KEY, new Date('2026-10-28T14:00:00Z')), new Date('2026-10-28T14:00:00Z'));
    assert.equal(stories.length, 1, 'the celebrity story is not election news');
    assert.equal(stories[0].members.length, 2, 'the Fox article joins the AP story through related coverage');
    assert.equal(stories[0].outletCount, 2);

    // Each run recorded Apify's $0.05, more than its articles at $2 per 1,000, so $0.10 is spent.
    // A $0.13 total cap leaves $0.03, under 20 articles, so the next run is skipped.
    const skipped = await run('2026-10-28T16:00:00Z', { ...limits, totalUsd: 0.13 });
    assert.equal(skipped.status, 'SKIPPED');
    assert.match(skipped.reason ?? '', /fewer than 20 articles/);
    assert.equal(seen.length, 2);
    const runs = await db.ingestionRun.findMany({ where: { source: { key: SOURCE_KEY } }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(runs.map((row) => row.status), ['SUCCEEDED', 'SUCCEEDED', 'CANCELLED']);
    assert.deepEqual(runs.map((row) => (row.metadata as { costUsd: number }).costUsd), [0.05, 0.05, 0]);
  } finally {
    await cleanup(db);
    await db.$disconnect();
  }
});
