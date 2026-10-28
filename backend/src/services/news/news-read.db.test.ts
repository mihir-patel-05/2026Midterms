import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { getTopStories } from './news-read.js';
import { syncNews } from './news-sync.js';
import { apifyItems, NEWS_NOW } from './test-fixtures.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const SOURCE_KEY = 'apify-google-news-read-test';

test('the read model serves the stored list, filters by topic, and hides anything past 24 hours', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const cleanup = async () => {
    await db.newsStory.deleteMany({ where: { ingestionRun: { source: { key: SOURCE_KEY } } } });
    await db.ingestionRun.deleteMany({ where: { source: { key: SOURCE_KEY } } });
    await db.dataSource.deleteMany({ where: { key: SOURCE_KEY } });
  };
  try {
    await cleanup();
    const before = await getTopStories(db, { now: NEWS_NOW, sourceKey: SOURCE_KEY });
    assert.deepEqual(before.stories, []);
    assert.equal(before.updatedAt, null);
    assert.equal(before.method, null);

    await syncNews(db, {
      search: { actorId: 'test', search: async () => ({ items: apifyItems(), actorId: 'test', runId: 'r', status: 'SUCCEEDED', costUsd: 0.01 }) },
      picker: null,
      pickerModel: 'unused',
      limit: 12,
      resultsPerQuery: 25,
      pricePer1000Usd: 2,
      budget: { dailyUsd: 10, totalUsd: 180 },
      now: NEWS_NOW,
      sourceKey: SOURCE_KEY,
      log: () => {},
    });

    const data = await getTopStories(db, { now: NEWS_NOW, sourceKey: SOURCE_KEY });
    assert.equal(data.method, 'RANKED');
    assert.equal(data.windowHours, 24);
    assert.equal(data.articlesConsidered, 7);
    assert.equal(data.storiesConsidered, 5);
    assert(data.updatedAt && data.checkedAt);
    assert.match(data.attribution!, /publisher/);
    assert.equal(data.stories.length, 4);
    assert.deepEqual(data.stories[0].alsoCoveredBy.map((item) => item.outlet), ['Dailytwo', 'Postthree']);

    const courts = await getTopStories(db, { now: NEWS_NOW, sourceKey: SOURCE_KEY, topic: 'COURTS' });
    assert.deepEqual(courts.stories.map((story) => story.topic), ['COURTS']);

    // The court story was published 6 hours before NEWS_NOW; 19 hours later it is past the window.
    const later = await getTopStories(db, { now: new Date(NEWS_NOW.getTime() + 19 * 3_600_000), sourceKey: SOURCE_KEY });
    assert(!later.stories.some((story) => story.headline.startsWith('Supreme Court')));
    assert.equal(later.stories.length, 3);
    const dayLater = await getTopStories(db, { now: new Date(NEWS_NOW.getTime() + 26 * 3_600_000), sourceKey: SOURCE_KEY });
    assert.deepEqual(dayLater.stories, []);
    assert.equal(dayLater.method, 'RANKED', 'still says how the last list was chosen');
  } finally {
    await cleanup();
    await db.$disconnect();
  }
});
