import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ElectionResultsResponseSchema } from './contracts.js';
import { dbBootstrapPayload, dbCurrentResult, dbSourceStatusPayload, type ReadModelConfig } from './read-model.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const config: ReadModelConfig = { mockEnabled: true, enabledProviderKeys: [], staleAfterSeconds: 300 };

// Read-only: fixture-ingestion.test.ts may move the current snapshot concurrently, so assertions
// compare against whatever the contest currently points at.
test('database read model serves the seeded fictional contest', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    const contestId = 'mock-contest-zz-house-00';
    const result = await dbCurrentResult(db, config, contestId);
    const { currentSnapshotId } = await db.contest.findUniqueOrThrow({ where: { id: contestId } });
    assert(result?.data);
    ElectionResultsResponseSchema.parse(result);
    assert.equal(result.meta.dataMode, 'MOCK');
    assert.equal(result.meta.source.providerKey, 'fictional-day0-fixture');
    assert([currentSnapshotId, 'mock-result-snapshot-day0'].includes(result.data.snapshotId));

    const bootstrap = await dbBootstrapPayload(db, config);
    assert(bootstrap);
    assert.match(bootstrap.data.manifest.version, /^db-[0-9a-f]{16}$/);
    assert(bootstrap.data.manifest.states.some((state) => state.code === 'ZZ'));
    const served = bootstrap.data.results.find((item) => item.meta.request.contestId === contestId);
    assert(served);
    for (const item of bootstrap.data.results) ElectionResultsResponseSchema.parse(item);

    const sources = await dbSourceStatusPayload(db, config);
    assert(sources?.data.sources.some((source) => source.providerKey === 'fictional-day0-fixture' && source.isMock));

    const disabled = { ...config, mockEnabled: false };
    assert.equal(await dbCurrentResult(db, disabled, contestId), null);
    assert.equal(await dbBootstrapPayload(db, disabled), null);
    assert.equal(await dbCurrentResult(db, config, 'missing-contest'), null);
  } finally {
    await db.$disconnect();
  }
});
