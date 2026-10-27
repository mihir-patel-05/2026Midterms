import assert from 'node:assert/strict';
import { test } from 'node:test';

test('top stories requests are validated before touching the database', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { topStoriesQuery } = await import('./news.routes.js');
  assert.deepEqual(topStoriesQuery.parse({}), { limit: 10 });
  assert.deepEqual(topStoriesQuery.parse({ limit: '5' }), { limit: 5 });
  for (const limit of ['0', '21', 'abc', '2.5']) {
    const parsed = topStoriesQuery.safeParse({ limit });
    assert.equal(parsed.success, false, limit);
    assert.match(parsed.error!.issues[0].message, /whole number from 1 to 20/);
  }
});
