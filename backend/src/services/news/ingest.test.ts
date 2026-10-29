import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildActorInput, parseInputOverrides } from './apify-client.js';
import { MIN_ITEMS_PER_RUN, planRun, remainingUsd } from './budget.js';
import { isExcludedDomain } from './domain-rules.js';
import { canonicalizeUrl, cleanHeadline, describeItemShape, describeRejected, normalizeItems, parsePublishedAt } from './normalize.js';
import { buildNewsQueries, plainQuery } from './queries.js';
import { groupStories, guessTopic, looksPolitical, rankStories } from './stories.js';

const NOW = new Date('2026-10-28T16:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

test('every query is limited to the past day, and results are added on election night', () => {
  const before = buildNewsQueries(NOW);
  assert(before.length >= 6);
  assert(before.every((query) => query.endsWith(' when:1d')));
  assert(!before.some((query) => query.includes('election results')));
  assert(buildNewsQueries(new Date('2026-11-04T01:00:00Z')).includes('election results when:1d'));
  assert.equal(plainQuery('Senate race when:1d'), 'Senate race');
});

test('actor input defaults can be renamed or removed by the overrides', () => {
  const request = { queries: ['a when:1d', 'b when:1d'], maxItemsPerQuery: 25, maxItems: 50, maxChargeUsd: 0.12 };
  const input = buildActorInput(request);
  assert.deepEqual(input.queries, request.queries);
  assert.equal(input.timeframe, '1d');
  assert.equal(input.maxItems, 50);

  const renamed = buildActorInput(request, parseInputOverrides('{"queries": null, "searchTerms": "$QUERIES", "timeframe": "24h"}'));
  assert.equal('queries' in renamed, false);
  assert.deepEqual(renamed.searchTerms, request.queries);
  assert.equal(renamed.timeframe, '24h');

  // An actor with its own time filter gets the queries without `when:1d`.
  const plain = buildActorInput(request, parseInputOverrides('{"queries": "$PLAIN_QUERIES", "timeframe": null, "timeRange": "day"}'));
  assert.deepEqual(plain.queries, ['a', 'b']);
  assert.equal(plain.timeRange, 'day');
  assert.equal('timeframe' in plain, false);
  assert.deepEqual(parseInputOverrides(undefined), {});
  assert.throws(() => parseInputOverrides('[1]'), /JSON object/);
});

test('URLs are canonicalized: host, tracking parameters, fragments, and AMP', () => {
  assert.equal(
    canonicalizeUrl('http://WWW.Example.com/politics/story/amp/?utm_source=x&b=2&fbclid=y&a=1#top'),
    'https://example.com/politics/story?a=1&b=2',
  );
  assert.equal(canonicalizeUrl('https://example.com/a/story.amp.html'), 'https://example.com/a/story.html');
  assert.equal(canonicalizeUrl('ftp://example.com/x'), null);
  assert.equal(canonicalizeUrl('not a url'), null);
});

test('publish times: ISO, RSS, epoch seconds, and relative', () => {
  assert.equal(parsePublishedAt('2026-10-28T12:00:00Z', NOW)?.toISOString(), '2026-10-28T12:00:00.000Z');
  assert.equal(parsePublishedAt('Wed, 28 Oct 2026 12:00:00 GMT', NOW)?.toISOString(), '2026-10-28T12:00:00.000Z');
  assert.equal(parsePublishedAt(1_793_188_800, NOW)?.toISOString(), new Date(1_793_188_800_000).toISOString());
  assert.equal(parsePublishedAt('3 hours ago', NOW)?.toISOString(), hoursAgo(3));
  assert.equal(parsePublishedAt('soon', NOW), null);
  assert.equal(cleanHeadline('Senate passes bill - The Daily', 'The Daily'), 'Senate passes bill');
});

test('excluded domains cover subdomains and official press releases, nothing else', () => {
  assert(isExcludedDomain('m.facebook.com'));
  assert(isExcludedDomain('www.prnewswire.com'));
  assert(isExcludedDomain('smith.house.gov'));
  assert(isExcludedDomain('janedoeforcongress.com'));
  assert(!isExcludedDomain('apnews.com'));
  assert(!isExcludedDomain('notx.com'));
});

test('normalize keeps the past 24 hours, rejects by reason, and merges duplicates', () => {
  const items = [
    { title: 'Senate leaders strike spending deal - Wire One', link: 'https://news.google.com/rss/articles/abc', decodedUrl: 'https://wireone.com/deal?utm_medium=rss', source: { name: 'Wire One' }, publishedAt: hoursAgo(2), description: 'Leaders agreed late Tuesday.', query: 'Congress when:1d' },
    // Same link found by another search: one article, two queries.
    { title: 'Senate leaders strike spending deal', url: 'https://www.wireone.com/deal', source: 'Wire One', publishedAt: hoursAgo(2), query: 'Senate race when:1d' },
    // Same outlet and headline at another link.
    { title: 'Senate leaders strike spending deal', url: 'https://wireone.com/deal-2', source: 'Wire One', publishedAt: hoursAgo(1) },
    { title: 'Undecoded', link: 'https://news.google.com/rss/articles/xyz', publishedAt: hoursAgo(1) },
    { title: 'Old', url: 'https://paper.com/old', publishedAt: hoursAgo(30) },
    { title: 'Future', url: 'https://paper.com/future', publishedAt: hoursAgo(-3) },
    { title: 'Press release', url: 'https://www.businesswire.com/x', publishedAt: hoursAgo(1) },
    { url: 'https://paper.com/no-title', publishedAt: hoursAgo(1) },
    { title: 'No time', url: 'https://paper.com/no-time' },
    { title: 'No link' },
    'junk',
  ];
  const { articles, rejected } = normalizeItems(items, { now: NOW });
  assert.equal(articles.length, 1);
  const [article] = articles;
  assert.equal(article.url, 'https://wireone.com/deal');
  assert.equal(article.headline, 'Senate leaders strike spending deal');
  assert.equal(article.outlet, 'Wire One');
  assert.equal(article.outletDomain, 'wireone.com');
  assert.equal(article.snippet, 'Leaders agreed late Tuesday.');
  assert.deepEqual(article.queries, ['Congress when:1d', 'Senate race when:1d']);
  assert.deepEqual(rejected, {
    duplicate: 2, google_redirect: 1, too_old: 1, in_future: 1, excluded_domain: 1, no_headline: 1, no_publish_time: 1, no_url: 1, not_an_object: 1,
  });
});

test('an outlet homepage is never used as the article link', () => {
  // Google News feed rows: an undecoded link, and the outlet's homepage in sourceUrl.
  const items = [
    { title: 'Senate control hinges on three races - The Times', link: 'https://news.google.com/rss/articles/CBMiAAA', source: 'The Times', sourceUrl: 'https://www.thetimes.com', publishedAt: hoursAgo(2) },
    { title: 'Early voting sets a record - The Times', link: 'https://news.google.com/rss/articles/CBMiBBB', source: 'The Times', sourceUrl: 'https://www.thetimes.com/?utm_source=rss', publishedAt: hoursAgo(3) },
    // Decoded: the article link wins over the homepage.
    { title: 'Court hears ballot case - The Times', link: 'https://www.thetimes.com/politics/ballot-case', source: 'The Times', sourceUrl: 'https://www.thetimes.com', publishedAt: hoursAgo(1) },
    { title: 'Homepage only', publisherUrl: 'https://paper.com/', publishedAt: hoursAgo(1) },
    { title: 'Query-string article', url: 'https://paper.com/?p=123', publishedAt: hoursAgo(1) },
  ];
  const { articles, rejected } = normalizeItems(items, { now: NOW });
  assert.deepEqual(articles.map((article) => article.url), ['https://thetimes.com/politics/ballot-case', 'https://paper.com/?p=123']);
  assert.deepEqual(rejected, { google_redirect: 2, no_url: 1 });
});

test('a run with nothing usable logs why: rejection counts and the shape of a result', () => {
  assert.equal(describeRejected({ no_url: 1, google_redirect: 8, too_old: 2 }), 'google_redirect 8, too_old 2, no_url 1');
  assert.equal(describeRejected({}), '');
  assert.equal(
    describeItemShape({ title: 'A - The Times', link: 'https://news.google.com/rss/articles/CBMiAAA', source: 'The Times', sourceUrl: 'https://www.thetimes.com', pubDate: 'Wed, 28 Oct 2026 12:00:00 GMT' }),
    'fields title, link, source, sourceUrl, pubDate; links link=news.google.com (Google link), sourceUrl=thetimes.com (homepage); time pubDate="Wed, 28 Oct 2026 12:00:00 GMT"',
  );
  assert.equal(describeItemShape({ headline: 'B', articleLink: 'https://x.com/b' }), 'fields headline, articleLink; links (none); time (none)');
  assert.equal(describeItemShape('text'), 'not an object (string)');
});

test('stories group the same event across outlets and rank by coverage and age', () => {
  const article = (outlet: string, headline: string, hours: number, query = 'q') => ({
    id: `${outlet}-${hours}`, url: `https://${outlet}.com/${hours}`, headline, snippet: null, outlet, outletDomain: `${outlet}.com`,
    publishedAt: new Date(hoursAgo(hours)), queries: [query],
  });
  const stories = groupStories([
    article('one', 'Supreme Court agrees to hear mail ballot deadline case', 5),
    article('two', 'Supreme Court will hear mail ballot deadline case', 4, 'q2'),
    article('three', 'Supreme Court to hear case on mail ballot deadline', 3),
    article('four', 'Governor signs state budget after long standoff', 1),
    article('five', 'Local team wins the championship race', 0.5),
  ]);
  assert.equal(stories.length, 3);
  const court = stories.find((story) => story.outletCount === 3)!;
  assert.equal(court.lead.outlet, 'one', 'the earliest report leads');
  assert.equal(court.queryHits, 2);
  assert.equal(court.latestAt.toISOString(), hoursAgo(3));

  const ranked = rankStories(stories, NOW);
  assert.equal(ranked[0], court, 'three outlets beat one newer outlet');
  assert.deepEqual(stories.filter(looksPolitical).map((story) => story.lead.outlet), ['one', 'four']);
  assert.equal(guessTopic(court.lead.headline), 'COURTS');
  assert.equal(guessTopic('New poll shows tight Senate race'), 'POLLS');
  assert.equal(guessTopic('Candidates clash in final Senate debate'), 'CAMPAIGN', 'campaign words win over the chamber name');
  assert.equal(guessTopic('Something else entirely'), 'OTHER');
});

test('budget: shrink to what is left, skip below the minimum, and name the cap', () => {
  const limits = { dailyUsd: 10, totalUsd: 180 };
  const full = planRun({ wantedItems: 200, pricePer1000Usd: 2, limits, spend: { last24hUsd: 0, totalUsd: 0 } });
  assert.deepEqual(full, { ok: true, maxItems: 200, maxChargeUsd: 0.48, estimateUsd: 0.48 });

  const shrunk = planRun({ wantedItems: 200, pricePer1000Usd: 2, limits, spend: { last24hUsd: 9.8, totalUsd: 50 } });
  assert.equal(shrunk.ok, true);
  assert.equal(shrunk.maxItems, 83);
  assert(shrunk.maxChargeUsd <= 0.2);

  const daily = planRun({ wantedItems: 200, pricePer1000Usd: 2, limits, spend: { last24hUsd: 9.95, totalUsd: 50 } });
  assert.equal(daily.ok, false);
  assert.match(daily.reason!, /daily news budget/);
  assert(daily.reason!.includes(`minimum ${MIN_ITEMS_PER_RUN}`));

  const total = planRun({ wantedItems: 200, pricePer1000Usd: 2, limits, spend: { last24hUsd: 1, totalUsd: 180 } });
  assert.match(total.reason!, /total news budget/);
  assert.equal(remainingUsd(limits, { last24hUsd: 12, totalUsd: 0 }), 0);
});
