/**
 * One ballot sync run under its own lease, shared by the CLI and the schedule.
 */
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { logBallotReport, syncBallot, type BallotSyncReport } from './ballot-sync.js';

export const BALLOT_LEASE = 'ballot';
const LEASE_MS = 15 * 60 * 1000;

/** Run a sync to completion. Throws SyncAlreadyRunningError if one is already running. */
export async function runBallotSync(options: { apply: boolean; cycle?: number }): Promise<BallotSyncReport> {
  const token = await acquireSyncLease(BALLOT_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const report = await syncBallot(options);
    logBallotReport(report);
    return report;
  } finally {
    await releaseSyncLease(BALLOT_LEASE, token);
  }
}
