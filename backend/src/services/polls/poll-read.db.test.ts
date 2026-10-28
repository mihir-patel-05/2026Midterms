import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { getRaceAverages, getRacePolls, PollsNotLoadedError } from './poll-read.js';
import { acceptPoll, listReviewQueue, PollReviewError, rejectPoll } from './poll-review.js';
import { syncPolls } from './poll-sync.js';
import { CANDIDATES, fakeVoteHubFetch, votehubPoll } from './test-fixtures.js';
import { VoteHubClient } from './votehub-client.js';

const testDatabaseUrl = process.env.TEST_POLLS_DATABASE_URL;
const NOW = new Date('2026-10-28T12:00:00Z');

// A source no real sync uses, so the test never touches real rows.
const SOURCE = 'votehub-read-test';
test('race polls and averages are read from published polls only, and reviews publish or hide them', { skip: !testDatabaseUrl }, async () => {
  const db = new PollsPrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const clear = async () => {
    await db.poll.deleteMany({ where: { source: SOURCE } });
    await db.pollSyncRun.deleteMany({ where: { source: SOURCE } });
  };
  try {
    await clear();
    await assert.rejects(getRacePolls(db, 'OH-SEN', { now: NOW, source: SOURCE }), PollsNotLoadedError);

    const routes = {
      pollTypes: ['us-senate', 'us-representative'],
      polls: {
        'us-senate': [
          votehubPoll({ id: 'a', pollster: 'Emerson College', end_date: '2026-10-25', answers: [{ choice: 'Brown', pct: 47 }, { choice: 'Husted', pct: 49 }] }),
          votehubPoll({ id: 'b', pollster: 'Siena', end_date: '2026-10-25', answers: [{ choice: 'Brown', pct: 49 }, { choice: 'Husted', pct: 47 }] }),
          votehubPoll({ id: 'c', pollster: 'Siena', end_date: '2026-09-01', start_date: '2026-08-28', answers: [{ choice: 'Brown', pct: 40 }, { choice: 'Husted', pct: 55 }] }),
          votehubPoll({ id: 'd', pollster: 'Husted for Senate', internal: true, answers: [{ choice: 'Brown', pct: 40 }, { choice: 'Husted', pct: 52 }] }),
          votehubPoll({ id: 'primary', answers: [{ choice: 'Paxton', pct: 44 }, { choice: 'Cornyn', pct: 41 }] }),
          votehubPoll({ id: 'nomatch', subject: null, answers: [{ choice: 'Jane Doe', pct: 44 }, { choice: 'John Roe', pct: 41 }] }),
        ],
        'us-representative': [],
      },
    };
    const client = new VoteHubClient({ baseUrl: 'https://api.votehub.com', retries: 0, minIntervalMs: 0, fetchImpl: fakeVoteHubFetch(routes) });
    await syncPolls(db, client, CANDIDATES, { source: SOURCE, now: NOW, log: () => {} });

    const ohio = await getRacePolls(db, 'OH-SEN', { now: NOW, source: SOURCE });
    assert.equal(ohio.totalPolls, 4);
    // Newest first; the internal poll and Siena's older poll are listed but not averaged.
    assert.deepEqual(ohio.polls.map((poll) => [poll.pollster, poll.endDate, poll.inAverage]), [
      ['Emerson College', '2026-10-25', true],
      ['Siena', '2026-10-25', true],
      ['Husted for Senate', '2026-10-20', false],
      ['Siena', '2026-09-01', false],
    ]);
    assert.equal(ohio.average.status, 'average');
    assert.equal(ohio.average.pollsterCount, 2);
    assert.deepEqual(ohio.average.candidates.map((candidate) => [candidate.name, candidate.party, candidate.pct]), [['Brown', 'DEM', 48], ['Husted', 'REP', 48]]);
    assert.equal(ohio.average.margin, null);
    assert.equal(ohio.source.attribution, 'Polls via VoteHub, licensed CC BY 4.0');
    assert.ok(ohio.source.lastSyncedAt);
    assert.deepEqual(ohio.polls[0].answers[0], { choice: 'Brown', pct: 47, party: 'DEM', candidateFecId: 'S6OH00001' });

    // The primary poll is held for review, so Texas has no public polling yet.
    const averages = await getRaceAverages(db, ['OH-SEN', 'TX-SEN', 'PA-07'], { now: NOW, source: SOURCE });
    assert.deepEqual(Object.fromEntries(Object.entries(averages.averages).map(([race, average]) => [race, average.status])), { 'OH-SEN': 'average', 'TX-SEN': 'none', 'PA-07': 'none' });

    const queue = await listReviewQueue(db, { limit: 10, source: SOURCE });
    assert.equal(queue.total, 2);
    assert.deepEqual(queue.byReason, { likely_primary: 1, no_race_match: 1 });
    const primary = queue.polls.find((poll) => poll.externalId === 'primary')!;
    const nomatch = queue.polls.find((poll) => poll.externalId === 'nomatch')!;

    await assert.rejects(acceptPoll(db, nomatch.id, { reviewer: 'tester' }), PollReviewError);
    await assert.rejects(acceptPoll(db, nomatch.id, { raceCode: 'PA-07', reviewer: 'tester' }), /This is a Senate poll; PA-07 is a House race/);

    const accepted = await acceptPoll(db, primary.id, { reviewer: 'tester', now: NOW });
    assert.deepEqual([accepted.status, accepted.raceCode, accepted.reviewedBy], ['PUBLISHED', 'TX-SEN', 'tester']);
    assert.equal((await getRacePolls(db, 'TX-SEN', { now: NOW, source: SOURCE })).average.status, 'too_few');

    // Accepting under another race drops the candidate links made for the old one.
    const moved = await acceptPoll(db, nomatch.id, { raceCode: 'OH-SEN', reviewer: 'tester', now: NOW });
    assert.equal(moved.raceCode, 'OH-SEN');
    assert.ok(moved.answers.every((answer) => answer.candidateFecId === null));
    const rejected = await rejectPoll(db, nomatch.id, { reviewer: 'tester', now: NOW });
    assert.equal(rejected.status, 'REJECTED');
    assert.equal((await getRacePolls(db, 'OH-SEN', { now: NOW, source: SOURCE })).totalPolls, 4);
    assert.equal((await listReviewQueue(db, { limit: 10, source: SOURCE })).total, 0);
  } finally {
    await clear();
    await db.$disconnect();
  }
});
