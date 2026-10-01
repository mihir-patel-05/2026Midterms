import type { Prisma } from '@prisma/client';

/** Call inside the same transaction that writes every vote and metric. */
export async function publishSnapshot(
  tx: Prisma.TransactionClient,
  contestId: string,
  snapshotId: string
): Promise<void> {
  const contest = await tx.contest.findUnique({
    where: { id: contestId },
    select: { sourceId: true, currentSnapshotId: true, currentSnapshot: { select: { sourceUpdatedAt: true } } },
  });
  const snapshot = await tx.resultSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      rawArtifact: { select: { status: true, sourceId: true, isMock: true, contentSha256: true } },
      _count: { select: { candidateVotes: true, contestMetrics: true } },
    },
  });

  if (!contest || !snapshot || snapshot.contestId !== contestId || contest.sourceId !== snapshot.sourceId) {
    throw new Error('Snapshot must belong to the contest being published');
  }
  if (snapshot.publicationStatus !== 'STAGED' && snapshot.publicationStatus !== 'PUBLISHED') {
    throw new Error('Only staged or already published snapshots may be current');
  }
  if (
    !snapshot.rawArtifact || snapshot.rawArtifact.status !== 'VALIDATED' ||
    snapshot.rawArtifact.sourceId !== snapshot.sourceId ||
    snapshot.rawArtifact.contentSha256 !== snapshot.payloadSha256 ||
    snapshot.rawArtifact.isMock !== snapshot.isMock ||
    snapshot._count.candidateVotes === 0 || snapshot._count.contestMetrics === 0
  ) {
    throw new Error('Snapshot is missing a validated artifact, votes, or metrics');
  }
  if (contest.currentSnapshotId === snapshotId) return;
  if (
    contest.currentSnapshot?.sourceUpdatedAt && snapshot.sourceUpdatedAt &&
    snapshot.sourceUpdatedAt < contest.currentSnapshot.sourceUpdatedAt
  ) {
    throw new Error('An older snapshot cannot replace the current result');
  }

  const [foreignVote, foreignMetric] = await Promise.all([
    tx.candidateVote.findFirst({
      where: {
        snapshotId,
        OR: [
          { candidacy: { contestId: { not: contestId } } },
          { reportingUnit: { sourceId: { not: snapshot.sourceId } } },
        ],
      },
      select: { id: true },
    }),
    tx.contestMetric.findFirst({
      where: { snapshotId, reportingUnit: { sourceId: { not: snapshot.sourceId } } },
      select: { id: true },
    }),
  ]);
  if (foreignVote || foreignMetric) {
    throw new Error('Snapshot votes and metrics must belong to its contest and source');
  }

  await tx.resultSnapshot.update({
    where: { id: snapshotId },
    data: { publicationStatus: 'PUBLISHED', publishedAt: new Date() },
  });
  await tx.contest.update({
    where: { id: contestId },
    data: { currentSnapshotId: snapshotId },
  });
  if (contest.currentSnapshotId) {
    await tx.resultSnapshot.update({
      where: { id: contest.currentSnapshotId },
      data: { publicationStatus: 'SUPERSEDED' },
    });
  }
}
