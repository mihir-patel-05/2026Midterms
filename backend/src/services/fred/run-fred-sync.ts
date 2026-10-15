/**
 * One FRED sync run under its own lease, shared by the CLI and the schedule.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { FredClient } from './fred-client.js';
import { syncFred, type FredSyncStats } from './fred-sync.js';

export const FRED_LEASE = 'fred';
const LEASE_MS = 30 * 60 * 1000;

/** Run a sync to completion. Throws SyncAlreadyRunningError if one is already running. */
export async function runFredSync(log: (message: string) => void = console.log): Promise<FredSyncStats> {
  if (!env.FRED_API_KEY) throw new Error('FRED_API_KEY is not configured; the FRED sync is unavailable');
  const token = await acquireSyncLease(FRED_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const client = new FredClient({ apiKey: env.FRED_API_KEY, baseUrl: env.FRED_API_BASE_URL });
    return await syncFred(prisma, client, { log });
  } finally {
    await releaseSyncLease(FRED_LEASE, token);
  }
}
