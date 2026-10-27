import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adapterFor, stripHtml } from './apify-actors.js';
import { buildFeedPlan } from './feeds.js';

const plan = buildFeedPlan(new Date('2026-10-28T12:00:00Z'), ['CAAqElections']);

test('the feed plan searches the past day and adds the results search only around election night', () => {
  assert.ok(plan.queries.every((query) => query.endsWith(' when:1d')));
  assert.ok(!plan.queries.some((query) => query.startsWith('election results')));
  const night = buildFeedPlan(new Date('2026-11-04T01:00:00Z'), []);
  assert.ok(night.queries.includes('election results when:1d'));
  const after = buildFeedPlan(new Date('2026-11-06T01:00:00Z'), []);
  assert.ok(!after.queries.includes('election results when:1d'));
});

test('tacps126 items keep their rank, real URL, outlet, and related coverage', () => {
  const adapter = adapterFor('tacps126/google-news');
  assert.equal(adapter.buildInput(plan, 120).maxItems, 120);
  const [topicItem, searchItem, unresolved, electionItem] = adapter.parseItems([
    { title: 'Senate control hinges on Ohio - AP News', publisher: 'AP News', publisherUrl: 'https://apnews.com', url: 'https://apnews.com/article/x', urlResolved: true, googleNewsUrl: 'https://news.google.com/rss/articles/abc?oc=5', publishedAt: '2026-10-28T10:00:00Z', topic: 'nation', position: 3, relatedArticles: [{ title: 'Ohio race tightens', publisher: 'Reuters', link: 'https://www.reuters.com/x' }] },
    { title: 'Early voting opens', publisher: 'NPR', url: 'https://www.npr.org/a', publishedAt: '2026-10-28T09:00:00Z', query: 'early voting when:1d', position: 1 },
    { title: 'No real link', publisher: 'Outlet', url: 'https://news.google.com/x', urlResolved: false, googleNewsUrl: 'https://news.google.com/x', publishedAt: '2026-10-28T09:00:00Z', topic: 'NATION' },
    { title: 'Election topic story', publisher: 'CNN', url: 'https://www.cnn.com/x', publishedAt: '2026-10-28T09:00:00Z', topic: 'CAAqElections' },
  ], plan);
  assert.equal(topicItem.feed, 'topic:NATION');
  assert.equal(topicItem.position, 3);
  assert.equal(topicItem.url, 'https://apnews.com/article/x');
  assert.equal(topicItem.outletHomeUrl, 'https://apnews.com');
  assert.deepEqual(topicItem.related, [{ headline: 'Ohio race tightens', outlet: 'Reuters', url: 'https://www.reuters.com/x' }]);
  // Searches are ordered by relevance, not prominence, so they get no rank.
  assert.equal(searchItem.feed, 'search:early voting');
  assert.equal(searchItem.position, null);
  assert.equal(unresolved.url, null);
  // The second NATION item had no rank, so its order in the feed gives one.
  assert.equal(unresolved.position, 2);
  assert.equal(electionItem.feed, 'elections:CAAqElections');
});

test('cirkit items get ranks from their order in each feed', () => {
  const adapter = adapterFor('cirkit/google-news-scraper');
  assert.equal(adapter.buildInput(plan, 80).maxResults, 80);
  const items = adapter.parseItems([
    { title: 'First', publisherName: 'AP News', publisherUrl: 'https://apnews.com/a', feedKind: 'topStories', publishedAt: '2026-10-28T10:00:00Z', snippetHtml: '<a href="x">First</a>&nbsp;<font>AP News</font>', relatedCoverage: [{ title: 'Same story', source: 'Fox News', url: 'https://www.foxnews.com/s' }] },
    { title: 'Second', publisherName: 'NBC News', publisherUrl: 'https://www.nbcnews.com/b', feedKind: 'topStories', publishedAt: '2026-10-28T10:00:00Z' },
    { title: 'Search hit', publisherName: 'Axios', publisherUrl: 'https://www.axios.com/c', feedKind: 'search', query: 'Senate race when:1d', publishedAt: '2026-10-28T10:00:00Z' },
  ], plan);
  assert.deepEqual(items.map((item) => [item.feed, item.position]), [['top', 1], ['top', 2], ['search:Senate race', null]]);
  assert.equal(items[0].snippet, 'First AP News');
  assert.equal(items[0].related[0].outlet, 'Fox News');
});

test('an unsupported actor is refused by name', () => {
  assert.throws(() => adapterFor('someone/else'), /No adapter for Apify actor "someone\/else"/);
  assert.equal(stripHtml('<b>a</b> &amp; b'), 'a & b');
});
