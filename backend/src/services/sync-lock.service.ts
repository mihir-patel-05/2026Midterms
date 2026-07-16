import { randomUUID } from 'crypto';
import { prisma } from '../config/database.js';

const DEFAULT_LEASE_MS = 6 * 60 * 60 * 1000;
const STALE_SYNC_MS = 6 * 60 * 60 * 1000;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('A full data sync is already running');
    this.name = 'SyncAlreadyRunningError';
  }
}

/** Mark abandoned process-local work as failed so it cannot block operations forever. */
export async function recoverStaleSyncLogs(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_SYNC_MS);
  const result = await prisma.syncLog.updateMany({
    where: {
      status: { in: ['started', 'running'] },
      startedAt: { lt: staleBefore },
    },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: 'Automatically failed after the sync lease expired.',
    },
  });
  return result.count;
}

/**
 * Atomically acquire a cross-process PostgreSQL lease. The conditional conflict
 * update ensures only one scheduler or admin process can own a named job.
 */
export async function acquireSyncLease(
  name = 'fec-full',
  leaseMs = DEFAULT_LEASE_MS,
): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + leaseMs);

  const rows = await prisma.$queryRaw<Array<{ token: string }>>`
    INSERT INTO "sync_leases" ("name", "token", "expires_at", "created_at", "updated_at")
    VALUES (${name}, ${token}, ${expiresAt}, NOW(), NOW())
    ON CONFLICT ("name") DO UPDATE
      SET "token" = EXCLUDED."token",
          "expires_at" = EXCLUDED."expires_at",
          "updated_at" = NOW()
      WHERE "sync_leases"."expires_at" < NOW()
    RETURNING "token"
  `;

  return rows[0]?.token === token ? token : null;
}

export async function releaseSyncLease(name: string, token: string): Promise<void> {
  await prisma.syncLease.deleteMany({ where: { name, token } });
}
