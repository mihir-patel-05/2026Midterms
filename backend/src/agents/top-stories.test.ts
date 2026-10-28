import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEWS_NOW, sampleCandidates } from '../services/news/test-fixtures.js';
import { candidateLines, PicksSchema, rankedTopStories, systemPrompt, validatePicks } from './top-stories.js';

const byHeadline = (text: string) => sampleCandidates().find((story) => story.lead.headline.includes(text))!;

test('the prompt is the same for every run apart from the limit, and names what is not a factor', () => {
  const prompt = systemPrompt(12);
  assert(prompt.includes('Pick up to 12 stories'));
  assert(prompt.includes('which side it helps, and its tone are not factors'));
  assert(!prompt.includes('{LIMIT}'));
});

test('candidate lines carry the lead, coverage, and other outlets, one JSON object per line', () => {
  const candidates = sampleCandidates();
  const lines = candidateLines(candidates).split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, candidates.length);
  const court = lines.find((line) => line.headline.startsWith('Supreme Court'));
  assert.equal(court.outlets, 3);
  assert.deepEqual(court.alsoRanIt, ['Dailytwo', 'Postthree']);
  assert.equal(court.outlet, 'Wireone');
});

test('validation drops unknown IDs, repeats, folded-in stories, and anything past the limit', () => {
  const candidates = sampleCandidates();
  const court = byHeadline('Supreme Court').id;
  const senate = byHeadline('stopgap').id;
  const poll = byHeadline('poll').id;
  const governor = byHeadline('Governor').id;
  const output = PicksSchema.parse({
    picks: [
      { id: court, topic: 'COURTS', stateCode: null, sameStoryAs: [governor, 'c999'] },
      { id: 'c999', topic: 'CONGRESS', stateCode: null, sameStoryAs: [] },
      { id: court, topic: 'COURTS', stateCode: null, sameStoryAs: [] },
      { id: governor, topic: 'VOTING', stateCode: null, sameStoryAs: [] },
      { id: poll, topic: 'POLLS', stateCode: 'PA', sameStoryAs: [] },
      { id: senate, topic: 'CONGRESS', stateCode: null, sameStoryAs: [] },
    ],
  });
  const { stories, dropped } = validatePicks(output, candidates, 2);
  assert.deepEqual(stories.map((story) => [story.story.id, story.topic, story.stateCode]), [[court, 'COURTS', null], [poll, 'POLLS', 'PA']]);
  assert.deepEqual(stories[0].related.map((story) => story.id), [governor]);
  // c999 twice (as a pick), the repeat, the folded-in governor story, and the senate story past the limit.
  assert.equal(dropped, 4);
});

test('unknown topics become OTHER and unknown states null, rather than failing the run', () => {
  const candidates = sampleCandidates();
  const output = PicksSchema.parse({
    picks: [
      { id: candidates[0].id, topic: 'SPORTS', stateCode: 'XX', sameStoryAs: [] },
      { id: candidates[1].id, topic: 'polls', stateCode: 'pa', sameStoryAs: [] },
    ],
  });
  const { stories } = validatePicks(output, candidates, 5);
  assert.deepEqual(stories.map((story) => [story.topic, story.stateCode]), [['OTHER', null], ['POLLS', 'PA']]);
});

test('the code ranking keeps political stories only, widest coverage first', () => {
  const ranked = rankedTopStories(sampleCandidates(), 12, NEWS_NOW);
  assert.equal(ranked.length, 4, 'the sports story is left out');
  assert.equal(ranked[0].story.outletCount, 3);
  assert.equal(ranked[0].topic, 'COURTS');
  assert(ranked.every((story) => story.stateCode === null && story.related.length === 0));
  assert.equal(rankedTopStories(sampleCandidates(), 2, NEWS_NOW).length, 2);
});
