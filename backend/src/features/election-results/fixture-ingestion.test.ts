import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ingestDay0Fixture } from './fixture-ingestion.js';
import { publishSnapshot } from './publication.js';

const fixturePath = fileURLToPath(new URL('../../../prisma/fixtures/day0-provider-neutral.mock.json', import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('fictional fixture replay, correction, rejection, and publication ownership', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    const original = JSON.parse(await readFile(fixturePath, 'utf8'));
    const seeded = await db.contest.findUniqueOrThrow({ where: { id: 'mock-contest-zz-house-00' } });
    assert.equal(seeded.currentSnapshotId, 'mock-result-snapshot-day0');

    const corrected = structuredClone(original);
    corrected.results[0].votes -= 10;
    corrected.metrics.votesCounted -= 10;
    corrected.sourceUpdatedAt = '2026-11-04T02:16:00.000Z';
    const correctedBytes = Buffer.from(JSON.stringify(corrected));
    const first = await ingestDay0Fixture(db, correctedBytes);
    assert.equal(first.replayed, false);
    const replay = await ingestDay0Fixture(db, correctedBytes);
    assert.equal(replay.replayed, true);
    assert.equal(replay.snapshotId, first.snapshotId);
    assert.equal(await db.rawArtifact.count({ where: { sourceId: 'mock-source-day0', contentSha256: first.sha256 } }), 1);
    assert.equal(await db.resultSnapshot.count({ where: { contestId: first.contestId, payloadSha256: first.sha256 } }), 1);
    const successfulRun = await db.ingestionRun.findFirstOrThrow({ where: { resultSnapshots: { some: { id: first.snapshotId } } } });
    assert.equal(successfulRun.status, 'SUCCEEDED');

    const current = await db.contest.findUniqueOrThrow({ where: { id: first.contestId } });
    assert.equal(current.currentSnapshotId, first.snapshotId);
    const previous = await db.resultSnapshot.findUniqueOrThrow({ where: { id: 'mock-result-snapshot-day0' } });
    assert.equal(previous.publicationStatus, 'SUPERSEDED');

    const invalid = structuredClone(corrected);
    invalid.results[0].votes = -1;
    await assert.rejects(ingestDay0Fixture(db, Buffer.from(JSON.stringify(invalid))));
    assert.equal((await db.contest.findUniqueOrThrow({ where: { id: first.contestId } })).currentSnapshotId, first.snapshotId);
    assert.equal(await db.ingestionRun.count({ where: { sourceId: 'mock-source-day0', status: 'FAILED' } }), 1);

    const older = structuredClone(original);
    older.results[0].votes -= 1;
    older.metrics.votesCounted -= 1;
    older.sourceUpdatedAt = '2026-11-04T02:15:30.000Z';
    await assert.rejects(ingestDay0Fixture(db, Buffer.from(JSON.stringify(older))), /older snapshot/);
    assert.equal((await db.contest.findUniqueOrThrow({ where: { id: first.contestId } })).currentSnapshotId, first.snapshotId);

    const otherContest = await db.contest.create({ data: {
      electionEventId: seeded.electionEventId, sourceId: seeded.sourceId,
      name: 'Fictional ownership check', office: 'US_HOUSE', stateCode: 'ZZ',
    } });
    try {
      await assert.rejects(db.$transaction((tx) => publishSnapshot(tx, otherContest.id, first.snapshotId)), /belong/);
      assert.equal((await db.contest.findUniqueOrThrow({ where: { id: otherContest.id } })).currentSnapshotId, null);

      const originalCandidacy = await db.candidacy.findFirstOrThrow({ where: { contestId: seeded.id } });
      const reportingUnit = await db.reportingUnit.findFirstOrThrow({ where: { sourceId: seeded.sourceId! } });
      await assert.rejects(db.$transaction(async (tx) => {
        const foreignCandidacy = await tx.candidacy.create({ data: {
          contestId: otherContest.id, personId: originalCandidacy.personId,
          sourceId: seeded.sourceId, sourceCandidateId: 'MOCK-FOREIGN-CANDIDATE',
        } });
        const fakeHash = 'a'.repeat(64);
        const artifact = await tx.rawArtifact.create({ data: {
          sourceId: seeded.sourceId!, ingestionRunId: successfulRun.id,
          contentSha256: fakeHash, storageKey: `test:sha256/${fakeHash}.json`,
          status: 'VALIDATED', isMock: true,
        } });
        const staged = await tx.resultSnapshot.create({ data: {
          contestId: seeded.id, sourceId: seeded.sourceId!, rawArtifactId: artifact.id,
          payloadSha256: fakeHash, sourceUpdatedAt: new Date('2026-11-04T02:17:00.000Z'), isMock: true,
        } });
        await tx.candidateVote.create({ data: {
          snapshotId: staged.id, candidacyId: foreignCandidacy.id,
          reportingUnitId: reportingUnit.id, votes: BigInt(1),
        } });
        await tx.contestMetric.create({ data: {
          snapshotId: staged.id, reportingUnitId: reportingUnit.id,
          votesCounted: BigInt(1),
        } });
        await publishSnapshot(tx, seeded.id, staged.id);
      }), /votes and metrics must belong/);
      assert.equal((await db.contest.findUniqueOrThrow({ where: { id: seeded.id } })).currentSnapshotId, first.snapshotId);
    } finally {
      await db.contest.delete({ where: { id: otherContest.id } });
    }
  } finally {
    await db.$disconnect();
  }
});
