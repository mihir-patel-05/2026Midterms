import assert from 'node:assert/strict';
import { test } from 'node:test';

test('top stories requests are validated before touching the database', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { topStoriesQuery } = await import('./news.routes.js');

  assert.deepEqual(topStoriesQuery.parse({}), {});
  assert.deepEqual(topStoriesQuery.parse({ topic: 'courts' }), { topic: 'COURTS' });
  for (const topic of ['SPORTS', '', ['POLLS', 'COURTS']]) {
    const parsed = topStoriesQuery.safeParse({ topic });
    assert.equal(parsed.success, false, String(topic));
    assert.match(parsed.error!.issues[0].message, /topic must be one of/);
  }
});
