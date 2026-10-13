/**
 * One Schedule E sync run under its own lease, shared by the CLI, the daily
 * schedule, and the manual API trigger. It shares the process's FEC rate
 * limiter with the main sync, so the two can overlap without exceeding it.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { fecClient } from '../../config/fec-client.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { recordScheduleEError, syncScheduleE, type ScheduleESyncStats } from './schedule-e-sync.js';

export const SCHEDULE_E_LEASE = 'fec-schedule-e';
const LEASE_MS = 3 * 60 * 60 * 1000;

/** Run a sync to completion. Throws SyncAlreadyRunningError if one is already running. */
export async function runScheduleESync(cycle = 2026): Promise<ScheduleESyncStats> {
  return (await startScheduleESync(cycle)).done;
}

/**
 * Take the lease and start a run. Resolves once the run has started, so an API
 * caller can answer before the run finishes; `done` settles when it does.
 */
export async function startScheduleESync(cycle = 2026): Promise<{ done: Promise<ScheduleESyncStats> }> {
  if (!env.FEC_API_KEY) throw new Error('FEC_API_KEY is not configured; outside spending sync is unavailable');
  const token = await acquireSyncLease(SCHEDULE_E_LEASE, LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  return { done: execute(cycle, token) };
}

async function execute(cycle: number, token: string): Promise<ScheduleESyncStats> {
  const startedAt = Date.now();
  const log = await prisma.syncLog.create({ data: { syncType: 'outside-spending', status: 'running', metadata: { cycle } } });
  try {
    const stats = await syncScheduleE(prisma, fecClient, {
      cycle,
      windowDays: env.SCHEDULE_E_WINDOW_DAYS,
      maxPages: env.SCHEDULE_E_MAX_PAGES,
    });
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        recordsProcessed: stats.window.rows + stats.backfill.rows,
        recordsSkipped: stats.window.skipped + stats.backfill.skipped,
        completedAt: new Date(),
        duration: Date.now() - startedAt,
        metadata: { cycle, stats } as object,
      },
    });
    return stats;
  } catch (error) {
    await recordScheduleEError(prisma, cycle, error);
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error), completedAt: new Date(), duration: Date.now() - startedAt },
    });
    throw error;
  } finally {
    await releaseSyncLease(SCHEDULE_E_LEASE, token);
  }
}
