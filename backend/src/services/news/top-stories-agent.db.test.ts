import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { getTopStories } from './news-read.js';
import { ensureNewsSource } from './news-sync.js';
import { runTopStoriesAgent, type ModelResult, type PickerModel, type TopStoriesPayload } from './top-stories-agent.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const SOURCE_KEY = 'apify-google-news-agent-test';
const NOW = new Date('2026-10-28T12:00:00Z');

async function cleanup(db: PrismaClient) {
  const outputs = await db.agentOutput.findMany({ where: { agent: 'TOP_STORIES' }, select: { id: true, agentRunId: true } });
  await db.agentOutputCitation.deleteMany({ where: { outputId: { in: outputs.map((output) => output.id) } } });
  await db.agentOutput.deleteMany({ where: { id: { in: outputs.map((output) => output.id) } } });
  await db.agentRun.deleteMany({ where: { agent: 'TOP_STORIES' } });
  const source = await db.dataSource.findUnique({ where: { key: SOURCE_KEY } });
  if (!source) return;
  await db.article.deleteMany({ where: { sourceId: source.id } });
  await db.ingestionRun.deleteMany({ where: { sourceId: source.id } });
  await db.dataSource.delete({ where: { id: source.id } });
}

async function seedArticles(db: PrismaClient, count: number) {
  const source = await ensureNewsSource(db, SOURCE_KEY, NOW);
  const run = await db.ingestionRun.create({ data: { sourceId: source.id, status: 'SUCCEEDED', parserVersion: 'test', startedAt: NOW, completedAt: NOW, metadata: { costUsd: 0 } } });
  await db.article.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      sourceId: source.id,
      ingestionRunId: run.id,
      externalId: `ext-${index}`,
      url: `https://outlet${index}.com/senate-${index}`,
      canonicalUrl: `https://outlet${index}.com/senate-${index}`,
      headline: `Senate race story ${index} with enough words`,
      outlet: `Outlet ${index}`,
      outletKey: `outlet${index}`,
      publishedAt: new Date(NOW.getTime() - (index + 1) * 3_600_000),
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      foundBy: ['search:Senate race'],
    })),
  });
}

/** Picks S1–S4 in reverse, with one bad ID and one bad race key. */
const fakeModel = (calls: string[]): PickerModel => async (_system, user) => {
  calls.push(user);
  const result: ModelResult = {
    output: {
      picks: [
        { storyId: 'S4', reason: 'POLL', raceKeys: ['GA-SEN'] },
        { storyId: 'S3', reason: 'DEBATE', raceKeys: ['XX-SEN'] },
        { storyId: 'S99', reason: 'POLL', raceKeys: [] },
        { storyId: 'S2', reason: 'NATIONAL_EVENT', raceKeys: [] },
        { storyId: 'S1', reason: 'CANDIDATE_NEWS', raceKeys: ['AZ-06'] },
      ],
      excluded: [{ storyId: 'S6', why: 'OPINION' }],
    },
    model: 'claude-test',
    stopReason: 'end_turn',
    inputTokens: 1200,
    outputTokens: 300,
  };
  return result;
};

test('the top stories agent publishes checked picks, supersedes old ones, and the API falls back when they go stale', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await cleanup(db);
  const calls: string[] = [];
  const run = (now: Date, model = fakeModel(calls), force = false) => runTopStoriesAgent(db, model, { modelName: 'claude-test', sourceKey: SOURCE_KEY, now, force, log: () => {} });
  try {
    await seedArticles(db, 3);
    assert.equal((await run(NOW)).status, 'SKIPPED', 'too few stories');

    await db.article.deleteMany({ where: { source: { key: SOURCE_KEY } } });
    await seedArticles(db, 8);
    const first = await run(NOW);
    assert.equal(first.status, 'PUBLISHED');
    const output = await db.agentOutput.findUniqueOrThrow({ where: { id: first.outputId! }, include: { citations: { orderBy: { rank: 'asc' } } } });
    const payload = output.payload as unknown as TopStoriesPayload;
    assert.deepEqual(payload.picks.map((pick) => [pick.headline, pick.reason, pick.raceKeys]), [
      ['Senate race story 3 with enough words', 'POLL', ['GA-SEN']],
      ['Senate race story 2 with enough words', 'DEBATE', []],
      ['Senate race story 1 with enough words', 'NATIONAL_EVENT', []],
      ['Senate race story 0 with enough words', 'CANDIDATE_NEWS', ['AZ-06']],
    ]);
    assert.equal(payload.droppedIds, 1);
    assert.equal(payload.droppedRaceKeys, 1);
    assert.equal(payload.excluded.length, 1);
    assert.deepEqual(output.citations.map((citation) => citation.reason), ['POLL', 'DEBATE', 'NATIONAL_EVENT', 'CANDIDATE_NEWS']);
    const agentRun = await db.agentRun.findUniqueOrThrow({ where: { id: first.agentRunId! } });
    assert.equal(agentRun.status, 'SUCCEEDED');
    assert.equal(agentRun.inputTokens, 1200);

    // Within the hour, nothing runs; after it, a forced run supersedes the first output.
    assert.equal((await run(new Date('2026-10-28T12:30:00Z'))).status, 'SKIPPED');
    const second = await run(new Date('2026-10-28T13:10:00Z'), fakeModel(calls), true);
    assert.equal(second.status, 'PUBLISHED');
    const statuses = await db.agentOutput.findMany({ where: { agent: 'TOP_STORIES' }, orderBy: { createdAt: 'asc' }, select: { status: true } });
    assert.deepEqual(statuses.map((row) => row.status), ['SUPERSEDED', 'PUBLISHED']);

    // A refusal is recorded as a failed run and changes nothing that is published.
    const refused = await run(new Date('2026-10-28T15:00:00Z'), async () => ({ output: null, model: 'claude-test', stopReason: 'refusal', inputTokens: 10, outputTokens: 0 }), true);
    assert.equal(refused.status, 'FAILED');
    assert.match(refused.reason ?? '', /declined/);

    const top = await getTopStories(db, { limit: 3, agentsEnabled: true, sourceKey: SOURCE_KEY, now: new Date('2026-10-28T13:30:00Z') });
    assert.equal(top.mode, 'top');
    assert.equal(top.items.length, 3);
    assert.equal(top.items[0].reason, 'POLL');
    assert.equal(top.consideredCount, 8);

    const stale = await getTopStories(db, { limit: 3, agentsEnabled: true, sourceKey: SOURCE_KEY, now: new Date('2026-10-28T16:30:00Z') });
    assert.equal(stale.mode, 'trending');
    assert.match(stale.reason ?? '', /more than 3 hours old/);
    const off = await getTopStories(db, { limit: 3, agentsEnabled: false, sourceKey: SOURCE_KEY, now: new Date('2026-10-28T13:30:00Z') });
    assert.equal(off.mode, 'trending');
    assert.equal(off.reason, null);
  } finally {
    await cleanup(db);
    await db.$disconnect();
  }
});
