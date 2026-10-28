import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NEWS_NOW, sampleCandidates } from '../services/news/test-fixtures.js';
import { pickTopStories, TOP_STORIES_PROMPT_VERSION, type PickerClient, type PicksOutput } from './top-stories.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A model name no real run uses, so the input hashes never match real rows.
const MODEL = 'test-model-top-stories';

function fakeClient(output: PicksOutput | Error) {
  const calls: Array<{ model: string; user: string }> = [];
  const client: PickerClient = {
    async pick(request) {
      calls.push({ model: request.model, user: request.user });
      if (output instanceof Error) throw output;
      return { output, model: request.model, inputTokens: 1200, outputTokens: 80 };
    },
  };
  return { client, calls };
}

test('the picker logs one agent run, reuses it for identical input, and falls back on failure', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const silent = () => {};
  try {
    await db.agentRun.deleteMany({ where: { agent: 'TOP_STORIES', model: { startsWith: MODEL } } });
    const candidates = sampleCandidates();
    const court = candidates.find((story) => story.outletCount === 3)!;
    const poll = candidates.find((story) => story.lead.headline.includes('poll'))!;
    const picks: PicksOutput = {
      picks: [
        { id: court.id, topic: 'COURTS', stateCode: null, sameStoryAs: [] },
        { id: poll.id, topic: 'POLLS', stateCode: 'PA', sameStoryAs: [] },
      ],
    };

    const first = fakeClient(picks);
    const result = await pickTopStories(db, candidates, { client: first.client, model: MODEL, limit: 10, now: NEWS_NOW, log: silent });
    assert.equal(result.method, 'AI');
    assert.deepEqual(result.stories.map((story) => story.story.id), [court.id, poll.id]);
    assert.equal(first.calls.length, 1);
    assert(!first.calls[0].user.includes('undefined'));
    const run = await db.agentRun.findUniqueOrThrow({ where: { id: result.agentRunId! } });
    assert.equal(run.status, 'SUCCEEDED');
    assert.equal(run.promptVersion, TOP_STORIES_PROMPT_VERSION);
    assert.equal(run.inputTokens, 1200);
    // The stored input is a summary, never the articles.
    assert.deepEqual(run.input, { candidates: candidates.length, candidatesBeforeCut: candidates.length, articles: 7, limit: 10, window: '24h' });
    assert.deepEqual(run.rawOutput, picks);

    // Identical input: no model call, same picks, same run.
    const again = fakeClient(picks);
    const reused = await pickTopStories(db, candidates, { client: again.client, model: MODEL, limit: 10, now: NEWS_NOW, log: silent });
    assert.equal(again.calls.length, 0);
    assert.equal(reused.reusedOutput, true);
    assert.equal(reused.agentRunId, result.agentRunId);

    // A failure is logged and the code ranking takes over.
    const failing = fakeClient(new Error('overloaded'));
    const fallback = await pickTopStories(db, candidates, { client: failing.client, model: `${MODEL}-2`, limit: 10, now: NEWS_NOW, log: silent });
    assert.equal(fallback.method, 'RANKED');
    assert.match(fallback.fallbackReason!, /overloaded/);
    assert.equal(fallback.stories.length, 4);
    const failed = await db.agentRun.findUniqueOrThrow({ where: { id: fallback.agentRunId! } });
    assert.equal(failed.status, 'FAILED');

    // The failed run is retried in place on the next identical input.
    const retry = fakeClient(picks);
    const retried = await pickTopStories(db, candidates, { client: retry.client, model: `${MODEL}-2`, limit: 10, now: NEWS_NOW, log: silent });
    assert.equal(retried.method, 'AI');
    assert.equal(retried.agentRunId, fallback.agentRunId);
    assert.equal(await db.agentRun.count({ where: { agent: 'TOP_STORIES', model: { startsWith: MODEL } } }), 2);

    // No client: ranked by code, nothing written.
    const off = await pickTopStories(db, candidates, { client: null, model: MODEL, limit: 10, now: NEWS_NOW, log: silent });
    assert.equal(off.method, 'RANKED');
    assert.equal(off.agentRunId, null);
  } finally {
    await db.agentRun.deleteMany({ where: { agent: 'TOP_STORIES', model: { startsWith: MODEL } } });
    await db.$disconnect();
  }
});
