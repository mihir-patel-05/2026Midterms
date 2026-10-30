import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { acquirePollsLease, releasePollsLease } from './run-poll-sync.js';
import { REMOVED_FROM_SOURCE, syncPolls } from './poll-sync.js';
import { CANDIDATES, fakeVoteHubFetch, votehubPoll } from './test-fixtures.js';
import { VoteHubClient } from './votehub-client.js';

const testDatabaseUrl = process.env.TEST_POLLS_DATABASE_URL;
// A source no real sync uses, so the test never touches real rows.
const SOURCE = 'votehub-test';
const NOW = new Date('2026-10-28T12:00:00Z');

const house = (id: string, overrides: Record<string, unknown> = {}) => votehubPoll({
  id,
  poll_type: 'us-representative',
  subject: 'PA-07',
  pollster: 'Muhlenberg College',
  answers: [{ choice: 'Ryan Mackenzie', pct: 46 }, { choice: 'Lamont Crosswell', pct: 47 }],
  ...overrides,
});

test('poll sync inserts, re-runs cheaply, applies changes, keeps reviews, and hides removed polls', { skip: !testDatabaseUrl }, async () => {
  const db = new PollsPrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const routes = {
    pollTypes: ['approval', 'generic-ballot', 'us-senate', 'us-representative'] as unknown,
    polls: {
      'us-senate': [
        votehubPoll(),
        votehubPoll({ id: 'vh-primary', answers: [{ choice: 'Paxton', pct: 44 }, { choice: 'Cornyn', pct: 41 }] }),
        votehubPoll({ id: 'vh-old', end_date: '2024-10-01', start_date: '2024-09-28' }),
      ],
      'us-representative': [house('vh-2001'), house('vh-2002', { pollster: 'Franklin & Marshall' })],
    } as Record<string, unknown[] | number>,
  };
  const client = () => new VoteHubClient({ baseUrl: 'https://api.votehub.com', retries: 0, minIntervalMs: 0, fetchImpl: fakeVoteHubFetch(routes) });
  const sync = (now = NOW) => syncPolls(db, client(), CANDIDATES, { source: SOURCE, now, log: () => {} });
  const row = (externalId: string) => db.poll.findUniqueOrThrow({ where: { source_externalId: { source: SOURCE, externalId } }, include: { answers: { orderBy: { sortOrder: 'asc' } } } });

  try {
    await db.poll.deleteMany({ where: { source: SOURCE } });
    await db.pollSyncRun.deleteMany({ where: { source: SOURCE } });

    const first = await sync();
    assert.equal(first.status, 'SUCCEEDED');
    assert.deepEqual(first.pollTypes.map((type) => type.pollType), ['us-senate', 'us-representative']);
    assert.deepEqual([first.fetched, first.inserted, first.skipped, first.needsReview], [5, 4, 1, 1]);
    const ohio = await row('vh-1001');
    assert.equal(ohio.raceCode, 'OH-SEN');
    assert.equal(ohio.status, 'PUBLISHED');
    assert.deepEqual(ohio.answers.map((answer) => [answer.choice, answer.pct.toNumber(), answer.party, answer.candidateFecId]), [
      ['Brown', 47, 'DEM', 'S6OH00001'],
      ['Husted', 48, 'REP', 'S6OH00002'],
      ['Undecided', 5, null, null],
    ]);
    assert.equal((ohio.raw as { pollster?: string }).pollster, 'Emerson College');
    const primary = await row('vh-primary');
    assert.deepEqual([primary.status, primary.reviewReason, primary.raceCode], ['NEEDS_REVIEW', 'likely_primary', 'TX-SEN']);
    assert.equal((await row('vh-2001')).raceCode, 'PA-07');

    // A second run writes nothing but last_seen_at.
    const later = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
    const second = await sync(later);
    assert.deepEqual([second.inserted, second.updated, second.unchanged, second.needsReview], [0, 0, 4, 0]);
    assert.equal((await row('vh-1001')).lastSeenAt.toISOString(), later.toISOString());

    // An admin accepts the primary poll; a later sync must not undo that.
    await db.poll.update({ where: { id: primary.id }, data: { status: 'PUBLISHED', reviewReason: null, reviewedAt: later, reviewedBy: 'admin@example.com' } });

    // New numbers rewrite the row and its answers; a poll that disappears is hidden.
    routes.polls['us-senate'] = [
      votehubPoll({ answers: [{ choice: 'Brown', pct: 48 }, { choice: 'Husted', pct: 47 }] }),
      votehubPoll({ id: 'vh-primary', answers: [{ choice: 'Paxton', pct: 45 }, { choice: 'Cornyn', pct: 40 }] }),
    ];
    routes.polls['us-representative'] = [house('vh-2001')];
    const third = await sync(new Date(later.getTime() + 3 * 60 * 60 * 1000));
    assert.deepEqual([third.updated, third.unchanged, third.removed], [2, 1, 1]);
    assert.deepEqual((await row('vh-1001')).answers.map((answer) => answer.pct.toNumber()), [48, 47]);
    const reviewed = await row('vh-primary');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['PUBLISHED', 'admin@example.com']);
    assert.deepEqual(reviewed.answers.map((answer) => answer.pct.toNumber()), [45, 40]);
    const gone = await row('vh-2002');
    assert.deepEqual([gone.status, gone.reviewReason], ['REJECTED', REMOVED_FROM_SOURCE]);

    // It is restored when it comes back. A failing type makes the run PARTIAL and keeps that type's rows.
    routes.polls['us-representative'] = [house('vh-2001'), house('vh-2002', { pollster: 'Franklin & Marshall' })];
    routes.polls['us-senate'] = 503;
    const fourth = await sync(new Date(later.getTime() + 6 * 60 * 60 * 1000));
    assert.equal(fourth.status, 'PARTIAL');
    assert.equal((await row('vh-2002')).status, 'PUBLISHED');
    assert.equal((await row('vh-1001')).status, 'PUBLISHED');
    const lastRun = await db.pollSyncRun.findUniqueOrThrow({ where: { id: fourth.runId } });
    assert.equal(lastRun.status, 'PARTIAL');
    assert.match(lastRun.errorSummary ?? '', /us-senate: VoteHub API 503/);

    // A truncated response doesn't hide polls: one of two came back.
    routes.polls['us-senate'] = [votehubPoll({ answers: [{ choice: 'Brown', pct: 48 }, { choice: 'Husted', pct: 47 }] })];
    routes.polls['us-representative'] = [];
    const fifth = await sync(new Date(later.getTime() + 9 * 60 * 60 * 1000));
    assert.equal(fifth.removed, 0);
    assert.equal((await row('vh-2001')).status, 'PUBLISHED');

    // When /poll-types fails, the known type names are tried.
    routes.pollTypes = 500;
    const sixth = await sync(new Date(later.getTime() + 12 * 60 * 60 * 1000));
    assert.deepEqual(sixth.pollTypes.map((type) => type.pollType), ['us-senate', 'us-representative']);
    assert.equal(sixth.status, 'SUCCEEDED');
  } finally {
    await db.poll.deleteMany({ where: { source: SOURCE } });
    await db.pollSyncRun.deleteMany({ where: { source: SOURCE } });
    await db.$disconnect();
  }
});

test('the polls lease admits one holder at a time', { skip: !testDatabaseUrl }, async () => {
  const db = new PollsPrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const name = 'polls-lease-test';
  try {
    const token = await acquirePollsLease(db, name, 60_000);
    assert.ok(token);
    assert.equal(await acquirePollsLease(db, name, 60_000), null);
    await releasePollsLease(db, name, token);
    const again = await acquirePollsLease(db, name, 60_000);
    assert.ok(again);
    await releasePollsLease(db, name, again);
  } finally {
    await db.pollSyncLease.deleteMany({ where: { name } });
    await db.$disconnect();
  }
});
