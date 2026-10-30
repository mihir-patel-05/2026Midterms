import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearNewsCache, parseRaceKey, parseRss, raceQuery, searchNews, topQuery } from './latest-coverage.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss><channel><title>search</title>
<item><title>Senate debate turns to tariffs &amp; jobs - The Philadelphia Inquirer</title><link>https://news.google.com/articles/a1</link>
<pubDate>Wed, 29 Oct 2026 14:00:00 GMT</pubDate><source url="https://www.inquirer.com">The Philadelphia Inquirer</source></item>
<item><title><![CDATA[New poll shows tight race - AP News]]></title><link>https://news.google.com/articles/a2</link>
<pubDate>Thu, 30 Oct 2026 09:30:00 GMT</pubDate><source url="https://apnews.com">AP News</source></item>
<item><title>New poll shows tight race - Yahoo News</title><link>https://news.google.com/articles/a3</link>
<pubDate>Thu, 30 Oct 2026 08:00:00 GMT</pubDate><source url="https://yahoo.com">Yahoo News</source></item>
<item><title>Rally clip - YouTube</title><link>https://news.google.com/articles/a4</link><source url="https://youtube.com">YouTube</source></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

test('RSS items become headlines with outlets, newest first, without repeats or platforms', () => {
  const items = parseRss(RSS, 10);
  assert.deepEqual(items, [
    { headline: 'New poll shows tight race', outlet: 'AP News', url: 'https://news.google.com/articles/a2', publishedAt: '2026-10-30T09:30:00.000Z' },
    { headline: 'Senate debate turns to tariffs & jobs', outlet: 'The Philadelphia Inquirer', url: 'https://news.google.com/articles/a1', publishedAt: '2026-10-29T14:00:00.000Z' },
  ]);
  assert.equal(parseRss(RSS, 1).length, 1);
});

test('race keys and searches', () => {
  assert.deepEqual(parseRaceKey('PA-SEN'), { state: 'PA', office: 'SENATE', district: null });
  assert.deepEqual(parseRaceKey('TX-07'), { state: 'TX', office: 'HOUSE', district: '07' });
  assert.equal(parseRaceKey('ZZ-01'), null);
  assert.equal(parseRaceKey('PA-7'), null);

  assert.deepEqual(raceQuery('TX-22', []), { label: 'TX-22', query: `"Texas's 22nd congressional district" election when:7d` });
  assert.equal(raceQuery('MI-11', [])!.query, `"Michigan's 11th congressional district" election when:7d`);
  assert.deepEqual(raceQuery('WY-00', []), { label: 'WY at-large', query: '"Wyoming" at-large congressional election when:7d' });
  assert.equal(raceQuery('PA-SEN', ['Jane "JJ" Doe', 'Sam Roe'])!.query, '("Jane JJ Doe" OR "Sam Roe" OR "Pennsylvania" Senate) (Senate OR election) when:7d');
  assert.equal(topQuery('GA').label, 'Georgia');
  assert.equal(topQuery(null).key, 'US');
});

test('searches are cached for ten minutes', async () => {
  clearNewsCache();
  let calls = 0;
  const fetchImpl = (async (url: string) => {
    calls += 1;
    assert.match(url, /^https:\/\/feed\.test\/rss\?q=/);
    return new Response(RSS, { status: 200 });
  }) as unknown as typeof fetch;
  await searchNews('https://feed.test/rss', 'q1', 5, fetchImpl, 0);
  await searchNews('https://feed.test/rss', 'q1', 5, fetchImpl, 9 * 60_000);
  assert.equal(calls, 1);
  const later = await searchNews('https://feed.test/rss', 'q1', 1, fetchImpl, 11 * 60_000);
  assert.equal(calls, 2);
  assert.equal(later.items.length, 1);

  const failing = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(searchNews('https://feed.test/rss', 'q2', 5, failing, 0), /HTTP 503/);
});

test('news requests are validated', async () => {
  process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
  const { raceNewsQuery, topNewsQuery } = await import('../../routes/news.routes.js');
  assert.deepEqual(raceNewsQuery.parse({ names: 'John Fetterman, Dave McCormick' }), { names: ['John Fetterman', 'Dave McCormick'], limit: 8 });
  assert.equal(raceNewsQuery.safeParse({ names: 'a) OR site:evil.com' }).success, false);
  assert.equal(raceNewsQuery.safeParse({ names: 'A B,C D,E F,G H,I J' }).success, false);
  assert.deepEqual(topNewsQuery.parse({ state: 'pa' }), { state: 'PA', limit: 10 });
  assert.equal(topNewsQuery.safeParse({ state: 'ZZ' }).success, false);
});
