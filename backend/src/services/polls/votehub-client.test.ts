import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeVoteHubFetch, votehubPoll } from './test-fixtures.js';
import {
  classifyPollType,
  normalizeParty,
  parseVoteHubPoll,
  pollList,
  pollTypeList,
  raceHintFromText,
  VoteHubClient,
  VoteHubRequestError,
} from './votehub-client.js';

test('poll types map to the Senate, the House, or nothing', () => {
  assert.equal(classifyPollType('us-senate'), 'SENATE');
  assert.equal(classifyPollType('senate'), 'SENATE');
  assert.equal(classifyPollType('us-representative'), 'HOUSE');
  assert.equal(classifyPollType('us-house'), 'HOUSE');
  for (const type of ['approval', 'generic-ballot', 'favorability', 'governor', 'us-president']) assert.equal(classifyPollType(type), null, type);
});

test('a VoteHub record parses into a poll', () => {
  const parsed = parseVoteHubPoll(votehubPoll());
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.poll, {
    externalId: 'vh-1001',
    pollType: 'us-senate',
    office: 'SENATE',
    subject: 'Ohio Senate',
    pollster: 'Emerson College',
    sponsors: ['The Hill'],
    startDate: '2026-10-18',
    endDate: '2026-10-20',
    sampleSize: 1000,
    population: 'LV',
    isInternal: false,
    url: 'https://emersoncollegepolling.com/ohio-2026/',
    stateHint: 'OH',
    districtHint: null,
    answers: [
      { choice: 'Brown', pct: 47, party: null },
      { choice: 'Husted', pct: 48, party: null },
      { choice: 'Undecided', pct: 5, party: null },
    ],
  });
});

test('the parser tolerates the variations VoteHub records show', () => {
  const parsed = parseVoteHubPoll(votehubPoll({
    id: 42,
    sponsors: 'CNN; SSRS',
    sample_size: '1,204',
    population: 'RV',
    start_date: '2026-10-21T00:00:00Z',
    end_date: '2026-10-20',
    internal: 'true',
    url: 'javascript:alert(1)',
    answers: [
      { choice: 'Brown', pct: '46.5' },
      { choice: 'Husted', pct: 47.25, party: 'Republican' },
      { choice: 'brown', pct: 3 },
      { choice: '', pct: 2 },
      { choice: 'Other', pct: 140 },
    ],
  }));
  assert.ok(parsed.ok);
  assert.equal(parsed.poll.externalId, '42');
  assert.deepEqual(parsed.poll.sponsors, ['CNN', 'SSRS']);
  assert.equal(parsed.poll.sampleSize, 1204);
  assert.equal(parsed.poll.population, 'RV');
  // A start after the end is dropped rather than stored backwards.
  assert.equal(parsed.poll.startDate, null);
  assert.equal(parsed.poll.isInternal, true);
  assert.equal(parsed.poll.url, null);
  assert.deepEqual(parsed.poll.answers, [
    { choice: 'Brown', pct: 46.5, party: null },
    { choice: 'Husted', pct: 47.25, party: 'REP' },
  ]);

  const missing = parseVoteHubPoll(votehubPoll({ id: undefined, sample_size: null, population: 'xx' }));
  assert.ok(missing.ok);
  assert.match(missing.poll.externalId, /^h:[0-9a-f]{24}$/);
  // The derived ID is stable across runs.
  assert.equal((parseVoteHubPoll(votehubPoll({ id: undefined, sample_size: null, population: 'xx' })) as typeof missing).poll.externalId, missing.poll.externalId);
  assert.equal(missing.poll.sampleSize, null);
  assert.equal(missing.poll.population, 'UNKNOWN');
});

test('records the sync cannot use are skipped with a reason', () => {
  const reasons = [
    parseVoteHubPoll(null),
    parseVoteHubPoll(votehubPoll({ poll_type: 'generic-ballot' })),
    parseVoteHubPoll(votehubPoll({ pollster: ' ' })),
    parseVoteHubPoll(votehubPoll({ end_date: 'last week' })),
    parseVoteHubPoll(votehubPoll({ answers: [{ choice: 'Brown', pct: 47 }] })),
  ].map((result) => (result.ok ? 'ok' : result.reason));
  assert.deepEqual(reasons, ['not an object', 'poll type generic-ballot is not a Senate or House race', 'no pollster', 'no end_date', 'fewer than two answers']);
  // The type it was fetched under stands in when the record has none.
  assert.equal(parseVoteHubPoll(votehubPoll({ poll_type: undefined }), 'us-representative').ok, true);
});

test('race hints come from codes and state names, never from prose', () => {
  assert.deepEqual(raceHintFromText('PA-07'), { state: 'PA', district: '07' });
  assert.deepEqual(raceHintFromText('2026 ak-al general'), { state: 'AK', district: '00' });
  assert.deepEqual(raceHintFromText('ga-sen'), { state: 'GA', district: null });
  assert.deepEqual(raceHintFromText('West Virginia Senate'), { state: 'WV', district: null });
  assert.deepEqual(raceHintFromText('voters in 5 counties'), { state: null, district: null });
  assert.deepEqual(raceHintFromText(null), { state: null, district: null });
  const house = parseVoteHubPoll(votehubPoll({ poll_type: 'us-representative', subject: 'Pennsylvania', district: '7' }));
  assert.ok(house.ok);
  assert.deepEqual([house.poll.stateHint, house.poll.districtHint], ['PA', '07']);
});

test('parties normalize to the codes the frontend colours', () => {
  assert.deepEqual(['D', 'Democratic', 'DFL', 'REP', 'gop', 'Independent', 'NPA', 'LIB', 'Green', 'Forward', '', null].map(normalizeParty),
    ['DEM', 'DEM', 'DEM', 'REP', 'REP', 'IND', 'IND', 'LIB', 'GRN', 'OTH', null, null]);
});

test('poll lists may be bare or wrapped', () => {
  assert.deepEqual(pollList([1]), [1]);
  assert.deepEqual(pollList({ polls: [1] }), [1]);
  assert.deepEqual(pollList({ data: [1] }), [1]);
  assert.throws(() => pollList({ error: 'x' }), VoteHubRequestError);
  assert.deepEqual(pollTypeList(['approval', ' us-senate ', '', { name: 'us-representative' }]), ['approval', 'us-senate', 'us-representative']);
});

test('the client paces requests, retries server errors, and gives up on client errors', async () => {
  let now = 0;
  const sleeps: number[] = [];
  const clock = { now: () => now, sleep: async (ms: number) => { sleeps.push(ms); now += ms; } };
  let failures = 1;
  const requested: string[] = [];
  const fetchImpl = fakeVoteHubFetch({ pollTypes: ['approval', 'us-senate'], polls: { 'us-senate': [votehubPoll()] } }, (url) => requested.push(url.pathname + url.search));
  const flaky: typeof fetch = async (input, init) => {
    if (failures-- > 0) return new Response('busy', { status: 503 });
    return fetchImpl(input, init);
  };
  const client = new VoteHubClient({ baseUrl: 'https://api.votehub.com/', fetchImpl: flaky, retryDelayMs: 100, minIntervalMs: 1000, clock });

  assert.deepEqual(await client.getPollTypes(), ['approval', 'us-senate']);
  assert.equal((await client.getPolls('us-senate')).length, 1);
  assert.deepEqual(requested, ['/poll-types', '/polls?poll_type=us-senate']);
  assert.equal(client.requestCount, 3);
  // A 100 ms back-off after the 503, then the pacing gaps.
  assert.deepEqual(sleeps, [100, 900, 1000]);

  await assert.rejects(client.getPolls('governor'), (error: Error) => error instanceof VoteHubRequestError && /400/.test(error.message));
  assert.equal(client.requestCount, 4);
});
