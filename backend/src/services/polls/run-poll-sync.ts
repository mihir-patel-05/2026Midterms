/**
 * One VoteHub poll sync under its own lease, shared by the CLI and the schedule.
 *
 * Candidates are read from the main database; everything the sync writes,
 * the lease included, goes to the polls database.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { getPollsDb, type PollsPrismaClient } from '../../config/polls-database.js';
import { SyncAlreadyRunningError } from '../sync-lock.service.js';
import type { RaceCandidate } from './race-match.js';
import { syncPolls, type PollSyncStats } from './poll-sync.js';
import { VoteHubClient } from './votehub-client.js';

export const POLLS_LEASE = 'polls-votehub';
const LEASE_MS = 30 * 60 * 1000;
const CYCLE = 2026;

export class PollsNotConfiguredError extends Error {
  constructor() {
    super('Polls are not configured: set POLLS_DATABASE_URL (and keep POLLS_ENABLED=true)');
    this.name = 'PollsNotConfiguredError';
  }
}

/** Same conditional upsert as the main database's sync lease, in the polls database. */
export async function acquirePollsLease(db: PollsPrismaClient, name: string, leaseMs: number): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + leaseMs);
  const rows = await db.$queryRaw<Array<{ token: string }>>`
    INSERT INTO "poll_sync_leases" ("name", "token", "expires_at", "created_at", "updated_at")
    VALUES (${name}, ${token}, ${expiresAt}, NOW(), NOW())
    ON CONFLICT ("name") DO UPDATE
      SET "token" = EXCLUDED."token",
          "expires_at" = EXCLUDED."expires_at",
          "updated_at" = NOW()
      WHERE "poll_sync_leases"."expires_at" < NOW()
    RETURNING "token"
  `;
  return rows[0]?.token === token ? token : null;
}

export async function releasePollsLease(db: PollsPrismaClient, name: string, token: string): Promise<void> {
  await db.pollSyncLease.deleteMany({ where: { name, token } });
}

/** 2026 Senate and House filers from the main database, for matching poll answers to races. */
export async function loadRaceCandidates(): Promise<RaceCandidate[]> {
  const rows = await prisma.candidate.findMany({
    where: {
      office: { in: ['S', 'SENATE', 'H', 'HOUSE'] },
      OR: [{ cycles: { has: CYCLE } }, { electionYears: { has: CYCLE } }],
    },
    select: { candidateId: true, name: true, party: true, office: true, state: true, district: true },
  });
  return rows.map((row) => ({
    fecId: row.candidateId,
    name: row.name,
    party: row.party,
    office: row.office === 'S' || row.office === 'SENATE' ? 'SENATE' : 'HOUSE',
    state: row.state.toUpperCase(),
    district: row.district,
  }));
}

/** Run a sync to completion. Throws SyncAlreadyRunningError if one is already running. */
export async function runPollSync(log: (message: string) => void = console.log): Promise<PollSyncStats> {
  const db = env.POLLS_ENABLED ? getPollsDb() : null;
  if (!db) throw new PollsNotConfiguredError();
  const token = await acquirePollsLease(db, POLLS_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const candidates = await loadRaceCandidates();
    log(`  ${candidates.length} 2026 Senate and House candidates to match against`);
    const client = new VoteHubClient({ baseUrl: env.VOTEHUB_API_BASE_URL });
    return await syncPolls(db, client, candidates, { log });
  } finally {
    await releasePollsLease(db, POLLS_LEASE, token);
  }
}
