import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RawNewsItem } from './apify-actors.js';
import { canonicalUrl, cleanHeadline, normalizeItem, outletKey, sha256 } from './normalize.js';
import { mergeBatch } from './news-store.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const item = (overrides: Partial<RawNewsItem> = {}): RawNewsItem => ({
  feed: 'topic:NATION',
  position: 4,
  headline: 'Ohio Senate race tightens in final week - AP News',
  url: 'https://www.apnews.com/article/ohio-senate?utm_source=x&id=7#top',
  googleUrl: 'https://news.google.com/rss/articles/abc?oc=5',
  outlet: 'AP News',
  outletHomeUrl: 'https://apnews.com',
  publishedAt: '2026-10-28T10:00:00Z',
  snippet: null,
  related: [],
  ...overrides,
});

test('canonical URLs drop tracking, fragments, www, and AMP suffixes', () => {
  assert.equal(canonicalUrl('http://www.Example.com/a/b/?utm_medium=x&b=2&a=1#frag'), 'https://example.com/a/b?a=1&b=2');
  assert.equal(canonicalUrl('https://example.com/story/amp/'), 'https://example.com/story');
  assert.equal(canonicalUrl('https://news.google.com/rss/articles/abc?oc=5&hl=en-US'), 'https://news.google.com/rss/articles/abc');
  assert.equal(canonicalUrl('mailto:x@y.z'), null);
  assert.equal(canonicalUrl('not a url'), null);
});

test('outlet names and Google headline suffixes are normalized', () => {
  assert.equal(outletKey('The New York Times'), outletKey('New York Times'));
  assert.equal(outletKey('AT&T News'), 'atandtnews');
  assert.equal(cleanHeadline('Ohio race tightens - AP News', 'AP News'), 'Ohio race tightens');
  // A dash that doesn't name the outlet stays.
  assert.equal(cleanHeadline('Ohio race - a closer look', 'AP News'), 'Ohio race - a closer look');
});

test('a complete item becomes an article keyed by its canonical URL', () => {
  const result = normalizeItem(item(), NOW);
  assert.ok(result.ok);
  const { article } = result;
  assert.equal(article.canonicalUrl, 'https://apnews.com/article/ohio-senate?id=7');
  assert.equal(article.externalId, sha256('https://apnews.com/article/ohio-senate?id=7'));
  assert.equal(article.headline, 'Ohio Senate race tightens in final week');
  assert.equal(article.outletKey, 'apnews');
  assert.equal(article.outletDomain, 'apnews.com');
});

test('an undecoded item falls back to the Google link', () => {
  const result = normalizeItem(item({ url: null }), NOW);
  assert.ok(result.ok);
  assert.equal(result.article.url, 'https://news.google.com/rss/articles/abc?oc=5');
});

test('incomplete, stale, future, and non-news items are dropped with a reason', () => {
  const reason = (overrides: Partial<RawNewsItem>) => {
    const result = normalizeItem(item(overrides), NOW);
    return result.ok ? 'kept' : result.rejection;
  };
  assert.equal(reason({ headline: null }), 'no_headline');
  assert.equal(reason({ url: null, googleUrl: null }), 'no_url');
  assert.equal(reason({ outlet: null, url: null, outletHomeUrl: null }), 'no_outlet');
  assert.equal(reason({ publishedAt: 'yesterday' }), 'no_time');
  assert.equal(reason({ publishedAt: '2026-10-25T11:00:00Z' }), 'too_old');
  assert.equal(reason({ publishedAt: '2026-10-28T13:30:00Z' }), 'future');
  assert.equal(reason({ url: 'https://www.youtube.com/watch?v=1', outletHomeUrl: null }), 'excluded_domain');
});

test('one article from several feeds keeps every feed and its best rank', () => {
  const a = normalizeItem(item({ feed: 'top', position: 9 }), NOW);
  const b = normalizeItem(item({ feed: 'search:Senate race', position: null, related: [{ headline: 'x', outlet: 'NPR', url: 'https://npr.org/x' }] }), NOW);
  const c = normalizeItem(item({ feed: 'topic:NATION', position: 3 }), NOW);
  assert.ok(a.ok && b.ok && c.ok);
  const [merged] = mergeBatch([a.article, b.article, c.article]);
  assert.deepEqual(merged.feeds, ['top', 'search:Senate race', 'topic:NATION']);
  assert.equal(merged.position, 3);
  assert.equal(merged.related.length, 1);
});
