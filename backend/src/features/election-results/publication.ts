import type { Prisma } from '@prisma/client';

/** Call inside the same transaction that writes every vote and metric. */
export async function publishSnapshot(
  tx: Prisma.TransactionClient,
  contestId: string,
  snapshotId: string
): Promise<void> {
  const contest = await tx.contest.findUnique({
    where: { id: contestId },
    select: { currentSnapshotId: true },
  });
  const snapshot = await tx.resultSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      rawArtifact: { select: { status: true, sourceId: true, isMock: true } },
      _count: { select: { candidateVotes: true, contestMetrics: true } },
    },
  });

  if (!contest || !snapshot || snapshot.contestId !== contestId) {
    throw new Error('Snapshot must belong to the contest being published');
  }
  if (snapshot.publicationStatus !== 'STAGED' && snapshot.publicationStatus !== 'PUBLISHED') {
    throw new Error('Only staged or already published snapshots may be current');
  }
  if (
    !snapshot.rawArtifact || snapshot.rawArtifact.status !== 'VALIDATED' ||
    snapshot.rawArtifact.sourceId !== snapshot.sourceId ||
    snapshot.rawArtifact.isMock !== snapshot.isMock ||
    snapshot._count.candidateVotes === 0 || snapshot._count.contestMetrics === 0
  ) {
    throw new Error('Snapshot is missing a validated artifact, votes, or metrics');
  }
  if (contest.currentSnapshotId === snapshotId) return;

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
