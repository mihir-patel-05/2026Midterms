import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clusterArticles, headlineKey, isElectionText, rankStories, scoreStory, type StoryArticle } from './trending.js';

const NOW = new Date('2026-10-28T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
let next = 0;
const article = (overrides: Partial<StoryArticle> = {}): StoryArticle => {
  next += 1;
  return {
    id: `a${String(next).padStart(3, '0')}`,
    headline: `Story number ${next} about something new today`,
    snippet: null,
    outlet: `Outlet ${next}`,
    outletKey: `outlet${next}`,
    url: `https://outlet${next}.com/story-${next}`,
    publishedAt: hoursAgo(1),
    foundBy: ['topic:NATION'],
    feedPosition: null,
    feedPositionAt: null,
    related: [],
    ...overrides,
  };
};

test('election terms are matched as whole words, the same for both parties', () => {
  assert.ok(isElectionText('Republicans gain in Senate polls'));
  assert.ok(isElectionText('Democrats launch new campaign ad'));
  assert.ok(isElectionText('Early voting turnout sets a record'));
  assert.ok(!isElectionText('White House hosts state dinner'));
  assert.ok(!isElectionText('Storm hits the Gulf Coast'));
  assert.equal(headlineKey('Live updates'), null);
});

test('articles that share a link or a headline become one story', () => {
  const lead = article({ related: [{ headline: 'Pennsylvania Senate debate draws sharp contrasts tonight', outlet: 'NPR', url: 'https://www.npr.org/debate?utm_source=g' }] });
  const sameLink = article({ url: 'https://npr.org/debate' });
  const sameHeadline = article({ headline: 'Pennsylvania Senate debate draws sharp contrasts, tonight!' });
  const unrelated = article();
  const groups = clusterArticles([lead, sameLink, sameHeadline, unrelated]).map((group) => group.map((item) => item.id).sort());
  assert.equal(groups.length, 2);
  assert.ok(groups.some((group) => group.length === 3 && group.includes(lead.id) && group.includes(sameLink.id) && group.includes(sameHeadline.id)));
});

test('the score counts outlets, rewards a fresh top rank, and halves every 12 hours', () => {
  const base = article({ foundBy: ['search:Senate race'], related: [{ headline: null, outlet: 'Reuters', url: 'https://reuters.com/a' }, { headline: null, outlet: 'Fox News', url: 'https://foxnews.com/a' }] });
  const story = scoreStory([base], NOW);
  assert.equal(story.outletCount, 3);
  assert.equal(story.score, Math.round(Math.log(4) * 0.5 ** (1 / 12) * 10_000) / 10_000);
  assert.deepEqual(story.alsoCoveredBy.map((entry) => entry.outlet), ['Reuters', 'Fox News']);

  const ranked = scoreStory([article({ feedPosition: 2, feedPositionAt: hoursAgo(1), publishedAt: NOW })], NOW);
  assert.equal(ranked.bestPosition, 2);
  assert.equal(ranked.score, Math.round((Math.log(2) + 1) * 10_000) / 10_000);
  // A rank older than 6 hours no longer counts.
  const staleRank = scoreStory([article({ feedPosition: 2, feedPositionAt: hoursAgo(7), publishedAt: NOW })], NOW);
  assert.equal(staleRank.bestPosition, null);

  const old = scoreStory([article({ publishedAt: hoursAgo(12) })], NOW);
  assert.equal(old.score, Math.round(Math.log(2) * 0.5 * 10_000) / 10_000);
});

test('the lead is the best-ranked article, then the earliest', () => {
  const early = article({ publishedAt: hoursAgo(5) });
  const topRanked = article({ publishedAt: hoursAgo(1), feedPosition: 4, feedPositionAt: hoursAgo(1) });
  assert.equal(scoreStory([early, topRanked], NOW).id, topRanked.id);
  assert.equal(scoreStory([topRanked, { ...early, id: 'z' }].map((item) => ({ ...item, feedPosition: null })), NOW).id, 'z');
});

test('only election stories are ranked, highest score first', () => {
  const election = article({ headline: 'Arizona Senate candidates clash over border policy', related: [{ headline: null, outlet: 'CNN', url: 'https://cnn.com/1' }] });
  const fromSearch = article({ headline: 'A quiet turnout story with plain words here', foundBy: ['search:early voting'] });
  const offTopic = article({ headline: 'Hurricane forecast shifts toward Florida coast today', related: [{ headline: null, outlet: 'CNN', url: 'https://cnn.com/2' }, { headline: null, outlet: 'ABC', url: 'https://abc.com/2' }] });
  const ranked = rankStories([election, fromSearch, offTopic], NOW, { limit: 10 });
  assert.deepEqual(ranked.map((story) => story.id), [election.id, fromSearch.id]);
  assert.equal(rankStories([election, fromSearch, offTopic], NOW, { electionOnly: false })[0].id, offTopic.id);
});
