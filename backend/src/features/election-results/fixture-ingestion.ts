import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import { publishSnapshot } from './publication.js';

const fixturePath = fileURLToPath(new URL('../../../prisma/fixtures/day0-provider-neutral.mock.json', import.meta.url));
const artifactDir = fileURLToPath(new URL('../../../.local/raw-artifacts/', import.meta.url));
const mockUrl = z.string().url().refine((value) => new URL(value).hostname === 'example.invalid');
const fixtureSchema = z.object({
  fixtureNotice: z.string().includes('FICTIONAL MOCK DATA'),
  fixtureVersion: z.literal('1.0.0'),
  source: z.object({ key: z.literal('fictional-day0-fixture'), name: z.string(), url: mockUrl, isMock: z.literal(true) }),
  sourceUpdatedAt: z.string().datetime({ offset: true }),
  election: z.object({ sourceElectionId: z.string(), name: z.string(), date: z.string(), type: z.literal('GENERAL'), stateCode: z.literal('ZZ') }),
  contest: z.object({ sourceContestId: z.string(), name: z.string(), office: z.literal('US_HOUSE'), districtCode: z.literal('00'), reportingStatus: z.enum(['PARTIAL', 'COMPLETE']), certification: z.enum(['UNOFFICIAL', 'CERTIFIED']) }),
  candidates: z.array(z.object({ sourceCandidateId: z.string(), name: z.string(), party: z.string(), ballotOrder: z.number().int().positive(), ballotStatus: z.literal('BALLOT_CONFIRMED') })).min(1),
  reportingUnits: z.array(z.object({ sourceUnitId: z.string(), name: z.string(), type: z.literal('DISTRICT') })).length(1),
  results: z.array(z.object({ sourceCandidateId: z.string(), sourceUnitId: z.string(), voteType: z.literal('TOTAL'), votes: z.number().int().nonnegative(), sourceVotePercentage: z.number().min(0).max(100) })).min(1),
  metrics: z.object({ sourceUnitId: z.string(), votesCounted: z.number().int().nonnegative(), reportingUnitsTotal: z.number().int().positive(), reportingUnitsReporting: z.number().int().nonnegative(), precinctsTotal: z.number().int().positive(), precinctsReporting: z.number().int().nonnegative(), reportingPercentage: z.number().min(0).max(100), isComplete: z.boolean() }),
});

function parseFixture(raw: Buffer) {
  const fixture = fixtureSchema.parse(JSON.parse(raw.toString('utf8')));
  const candidateIds = new Set(fixture.candidates.map((candidate) => candidate.sourceCandidateId));
  const unitId = fixture.reportingUnits[0].sourceUnitId;
  const resultIds = new Set(fixture.results.map((result) => result.sourceCandidateId));
  const sum = fixture.results.reduce((total, result) => total + result.votes, 0);
  if (
    candidateIds.size !== fixture.candidates.length || resultIds.size !== fixture.results.length ||
    resultIds.size !== candidateIds.size ||
    fixture.results.some((result) => !candidateIds.has(result.sourceCandidateId) || result.sourceUnitId !== unitId) ||
    fixture.metrics.sourceUnitId !== unitId || fixture.metrics.votesCounted !== sum ||
    fixture.metrics.reportingUnitsReporting > fixture.metrics.reportingUnitsTotal ||
    fixture.metrics.precinctsReporting > fixture.metrics.precinctsTotal ||
    fixture.metrics.isComplete !== (fixture.contest.reportingStatus === 'COMPLETE') ||
    (fixture.contest.certification === 'CERTIFIED' && fixture.contest.reportingStatus !== 'COMPLETE')
  ) throw new Error('Fictional fixture has inconsistent candidate, unit, vote, or progress data');
  return fixture;
}

/** Replay the checked-in fictional fixture only. Required identity rows come from the SQL seed. */
export async function ingestDay0Fixture(db: PrismaClient, raw?: Buffer) {
  const bytes = raw ?? await readFile(fixturePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const source = await db.dataSource.findUnique({ where: { key: 'fictional-day0-fixture' } });
  if (!source || !source.isMock || source.type !== 'MOCK_FIXTURE') {
    throw new Error('Apply the fictional SQL seed to a disposable database first');
  }
  const existing = await db.resultSnapshot.findFirst({
    where: { sourceId: source.id, payloadSha256: sha256 },
    select: { id: true, contestId: true },
  });
  if (existing) return { replayed: true, snapshotId: existing.id, contestId: existing.contestId, sha256 };

  await mkdir(artifactDir, { recursive: true });
  try {
    await writeFile(`${artifactDir}/${sha256}.json`, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const stored = await readFile(`${artifactDir}/${sha256}.json`);
    if (!stored.equals(bytes)) throw new Error('Content-addressed mock artifact does not match its SHA-256 key');
  }

  const run = await db.ingestionRun.create({
    data: { sourceId: source.id, status: 'RUNNING', parserVersion: 'fixture-parser/1.0.0', startedAt: new Date(), recordsFetched: 1, metadata: { isMock: true } },
  });
  const artifact = await db.rawArtifact.upsert({
    where: { sourceId_contentSha256: { sourceId: source.id, contentSha256: sha256 } },
    create: {
      sourceId: source.id, ingestionRunId: run.id, contentSha256: sha256,
      storageKey: `local:sha256/${sha256}.json`,
      payloadByteSize: BigInt(bytes.byteLength), contentType: 'application/json', isMock: true,
      sourceUrl: 'https://example.invalid/2026/results/zz/house-00', status: 'FETCHED',
    },
    update: {},
  });

  let fixture: ReturnType<typeof parseFixture>;
  try {
    fixture = parseFixture(bytes);
  } catch (error) {
    await db.ingestionError.create({ data: {
      ingestionRunId: run.id, rawArtifactId: artifact.id, severity: 'ERROR', code: 'INVALID_FIXTURE',
      message: error instanceof Error ? error.message : 'Invalid fixture',
    } });
    await db.rawArtifact.update({ where: { id: artifact.id }, data: { status: 'REJECTED' } });
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), recordsRejected: 1, errorSummary: 'Fixture validation failed' } });
    throw error;
  }

  try {
    const snapshotId = await db.$transaction(async (tx) => {
      const contest = await tx.contest.findFirst({ where: { sourceId: source.id, sourceContestId: fixture.contest.sourceContestId }, include: { electionEvent: true } });
      const unit = await tx.reportingUnit.findFirst({ where: { sourceId: source.id, sourceUnitId: fixture.reportingUnits[0].sourceUnitId } });
      if (!contest || !unit || contest.electionEvent.sourceElectionId !== fixture.election.sourceElectionId || contest.stateCode !== 'ZZ') {
        throw new Error('Seeded fictional contest or reporting unit does not match the fixture');
      }
      const candidacies = await tx.candidacy.findMany({ where: { contestId: contest.id, sourceId: source.id }, select: { id: true, sourceCandidateId: true } });
      if (candidacies.length !== fixture.candidates.length || candidacies.some((candidate) => !fixture.candidates.some((item) => item.sourceCandidateId === candidate.sourceCandidateId))) {
        throw new Error('Seeded fictional candidacies do not match the fixture');
      }
      await tx.rawArtifact.update({ where: { id: artifact.id }, data: { status: 'VALIDATED', sourceUpdatedAt: new Date(fixture.sourceUpdatedAt) } });
      const snapshot = await tx.resultSnapshot.create({ data: {
        contestId: contest.id, sourceId: source.id, ingestionRunId: run.id, rawArtifactId: artifact.id,
        payloadSha256: sha256, publicationStatus: 'STAGED', reportingStatus: fixture.contest.reportingStatus,
        certification: fixture.contest.certification, sourceUpdatedAt: new Date(fixture.sourceUpdatedAt),
        isPartial: fixture.contest.reportingStatus !== 'COMPLETE', isMock: true,
        notes: fixture.fixtureNotice,
      } });
      await tx.candidateVote.createMany({ data: fixture.results.map((result) => ({
        snapshotId: snapshot.id, reportingUnitId: unit.id,
        candidacyId: candidacies.find((candidate) => candidate.sourceCandidateId === result.sourceCandidateId)!.id,
        voteType: result.voteType, votes: BigInt(result.votes), sourceVotePercentage: new Prisma.Decimal(result.sourceVotePercentage),
      })) });
      await tx.contestMetric.create({ data: {
        snapshotId: snapshot.id, reportingUnitId: unit.id, votesCounted: BigInt(fixture.metrics.votesCounted),
        reportingUnitsTotal: fixture.metrics.reportingUnitsTotal, reportingUnitsReporting: fixture.metrics.reportingUnitsReporting,
        precinctsTotal: fixture.metrics.precinctsTotal, precinctsReporting: fixture.metrics.precinctsReporting,
        reportingPercentage: new Prisma.Decimal(fixture.metrics.reportingPercentage), isComplete: fixture.metrics.isComplete,
      } });
      await publishSnapshot(tx, contest.id, snapshot.id);
      await tx.ingestionRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), recordsAccepted: 1 } });
      return { id: snapshot.id, contestId: contest.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { replayed: false, snapshotId: snapshotId.id, contestId: snapshotId.contestId, sha256 };
  } catch (error) {
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'FAILED', completedAt: new Date(), recordsRejected: 1, errorSummary: error instanceof Error ? error.message : 'Publication failed' } });
    throw error;
  }
}
