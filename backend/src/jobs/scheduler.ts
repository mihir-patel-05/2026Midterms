/**
 * FEC Data Sync Scheduler
 * Runs automated data synchronization jobs on a weekly schedule
 *
 * Schedule: Every Sunday, Tuesday, Thursday at 2:00 AM EST
 * Cron expression: '0 2 * * 0,2,4'
 */

import cron from 'node-cron';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';
import { isFecAuthError } from '../config/fec-client.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';
import { syncIdeologyScores } from '../services/ideology.service.js';
import { electionService } from '../services/election.service.js';
import {
  acquireSyncLease,
  recoverStaleSyncLogs,
  releaseSyncLease,
  SyncAlreadyRunningError,
} from '../services/sync-lock.service.js';

// Configuration for scheduled syncs
const SYNC_CONFIG = {
  // Offices to sync
  offices: ['S', 'H'] as const, // S = Senate, H = House

  // Current election cycle
  cycle: 2026,

  // Batch processing size
  batchSize: 5,

  // Refresh a candidate's detailed totals at most this often
  skipIfSyncedWithinHours: 12,
};

interface SyncStats {
  candidatesSynced: number;
  candidatesErrors: number;
  candidatesSkipped: number;
  financesSynced: number;
  financesErrors: number;
  committeesSynced: number;
  committeesErrors: number;
  receiptsSynced: number;
  disbursementsSynced: number;
  itemizedErrors: number;
  electionsCreated: number;
  candidateLinksCreated: number;
  electionErrors: number;
  duration: number;
}

/** Claim the cross-process sync lease, or throw if another sync holds it. */
async function claimSyncLease(): Promise<string> {
  const recovered = await recoverStaleSyncLogs();
  if (recovered > 0) {
    console.warn(`⚠️  Marked ${recovered} abandoned sync log(s) as failed`);
  }

  const leaseToken = await acquireSyncLease('fec-full');
  if (!leaseToken) throw new SyncAlreadyRunningError();
  return leaseToken;
}

/**
 * Full sync with SyncLog tracking. Owns the lease from here on and always
 * releases it.
 */
async function executeSync(leaseToken: string): Promise<void> {
  const startTime = Date.now();

  // Create initial sync log entry
  let syncLog;
  try {
    syncLog = await prisma.syncLog.create({
      data: {
        syncType: 'full',
        status: 'started',
        metadata: {
          offices: [...SYNC_CONFIG.offices],
          cycles: [SYNC_CONFIG.cycle],
          scheduledSync: true,
        },
      },
    });
  } catch (error) {
    await releaseSyncLease('fec-full', leaseToken);
    throw error;
  }

  console.log('\n' + '='.repeat(70));
  console.log('🔄 SCHEDULED FEC DATA SYNC STARTED');
  console.log('='.repeat(70));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🆔 Sync Log ID: ${syncLog.id}`);
  console.log(`🏛️  Offices: Senate & House`);
  console.log('='.repeat(70) + '\n');

  const stats: SyncStats = {
    candidatesSynced: 0,
    candidatesErrors: 0,
    candidatesSkipped: 0,
    financesSynced: 0,
    financesErrors: 0,
    committeesSynced: 0,
    committeesErrors: 0,
    receiptsSynced: 0,
    disbursementsSynced: 0,
    itemizedErrors: 0,
    electionsCreated: 0,
    candidateLinksCreated: 0,
    electionErrors: 0,
    duration: 0,
  };

  try {
    // Update status to running
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'running' },
    });

    // Step 1: Every active candidate with headline totals, in bulk. A failed
    // fetch aborts the run rather than publishing a partial candidate list.
    console.log('📥 STEP 1: Syncing Candidates + Headline Totals\n');

    for (const office of SYNC_CONFIG.offices) {
      const result = await candidateService.syncCandidatesWithTotals({
        office,
        cycle: SYNC_CONFIG.cycle,
      });
      stats.candidatesSynced += result.synced;
      stats.candidatesErrors += result.errors;
    }

    console.log(
      `\n📊 Candidate Sync Summary: ${stats.candidatesSynced} synced, ${stats.candidatesErrors} errors\n`
    );

    // Step 2: Keep race shells and active FEC filing links in sync. This only
    // needs the candidate list from step 1, so it runs before the hours-long
    // step 3 and the map shows races minutes into a sync, not at the end.
    const elections = await electionService.generateElections(SYNC_CONFIG.cycle);
    stats.electionsCreated = elections.electionsCreated;
    stats.candidateLinksCreated = elections.candidateLinksCreated;
    stats.electionErrors = elections.errors;

    // Step 3: Source breakdown + committees, one candidate at a time. Only
    // candidates who have raised money need it, biggest fundraisers first, so
    // the competitive races fill in early if the run is cut short.
    console.log('📥 STEP 3: Syncing Detailed Totals + Committees\n');

    const skipThreshold = new Date(
      Date.now() - SYNC_CONFIG.skipIfSyncedWithinHours * 60 * 60 * 1000
    );

    const fundedCandidates = await prisma.candidateFinancial.count({
      where: { cycle: SYNC_CONFIG.cycle, receipts: { gt: 0 } },
    });
    const candidatesToSync = await prisma.candidateFinancial.findMany({
      where: {
        cycle: SYNC_CONFIG.cycle,
        receipts: { gt: 0 },
        OR: [{ detailedSyncedAt: null }, { detailedSyncedAt: { lt: skipThreshold } }],
      },
      orderBy: { receipts: 'desc' },
      select: { candidateId: true, candidate: { select: { name: true } } },
    });

    stats.candidatesSkipped = fundedCandidates - candidatesToSync.length;

    console.log(`  📋 Candidates with receipts: ${fundedCandidates}`);
    console.log(`  ⏭️  Skipped (recently synced): ${stats.candidatesSkipped}`);
    console.log(`  🔄 Need syncing: ${candidatesToSync.length}\n`);

    // Process in batches
    for (let i = 0; i < candidatesToSync.length; i += SYNC_CONFIG.batchSize) {
      const batch = candidatesToSync.slice(i, i + SYNC_CONFIG.batchSize);

      await Promise.all(
        batch.map(async ({ candidateId, candidate }) => {
          try {
            const [finResult, commResult] = await Promise.all([
              financeService.syncCandidateFinancials(candidateId, SYNC_CONFIG.cycle),
              candidateService.syncCandidateCommittees(candidateId),
            ]);

            stats.financesSynced += finResult.synced;
            stats.financesErrors += finResult.errors;
            stats.committeesSynced += commResult.synced;
            stats.committeesErrors += commResult.errors;
          } catch (error: any) {
            if (isFecAuthError(error)) throw error;
            console.error(`  ❌ ${candidate.name}:`, error.message);
            stats.financesErrors++;
          }
        })
      );

      if ((i / SYNC_CONFIG.batchSize) % 20 === 19) {
        console.log(`  Progress: ${Math.min(i + SYNC_CONFIG.batchSize, candidatesToSync.length)}/${candidatesToSync.length}`);
      }
    }

    console.log(
      `\n📊 Finance Sync Summary: ${stats.financesSynced} synced, ${stats.financesErrors} errors`
    );
    console.log(
      `📊 Committee Sync Summary: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors\n`
    );

    // Step 4: Refresh a bounded, oldest-first batch of itemized finance data.
    const itemized = await financeService.syncItemizedBatch(SYNC_CONFIG.cycle);
    stats.receiptsSynced = itemized.receiptsSynced;
    stats.disbursementsSynced = itemized.disbursementsSynced;
    stats.itemizedErrors = itemized.errors;
    console.log(
      `📄 Itemized finance: ${itemized.committeesProcessed} committees, ` +
      `${itemized.receiptsSynced} receipts, ${itemized.disbursementsSynced} disbursements, ` +
      `${itemized.errors} errors\n`
    );

    stats.duration = Date.now() - startTime;

    // Update sync log as completed
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        recordsProcessed:
          stats.candidatesSynced +
          stats.financesSynced +
          stats.committeesSynced +
          stats.receiptsSynced +
          stats.disbursementsSynced +
          stats.electionsCreated +
          stats.candidateLinksCreated,
        recordsErrors:
          stats.candidatesErrors +
          stats.financesErrors +
          stats.committeesErrors +
          stats.itemizedErrors +
          stats.electionErrors,
        recordsSkipped: stats.candidatesSkipped,
        completedAt: new Date(),
        duration: stats.duration,
        metadata: {
          ...(syncLog.metadata as Record<string, any>),
          stats,
        } as any,
      },
    });

    console.log('\n' + '='.repeat(70));
    console.log('✅ SCHEDULED FEC DATA SYNC COMPLETED');
    console.log('='.repeat(70));
    console.log(`⏱️  Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(
      `👥 Candidates: ${stats.candidatesSynced} synced, ${stats.candidatesSkipped} skipped`
    );
    console.log(`💰 Finances: ${stats.financesSynced} synced, ${stats.financesErrors} errors`);
    console.log(
      `🏢 Committees: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors`
    );
    console.log(
      `🗳️  Elections: ${stats.electionsCreated} created, ${stats.candidateLinksCreated} candidate links`
    );
    console.log('='.repeat(70) + '\n');
  } catch (error: any) {
    console.error('\n❌ Fatal error during scheduled sync:', error);

    // Update sync log as failed
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        errorMessage: isFecAuthError(error)
          ? 'OpenFEC rejected the API key (check FEC_API_KEY)'
          : error.message,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      },
    });

    throw error;
  } finally {
    await releaseSyncLease('fec-full', leaseToken);
  }
}

/** Run a full sync to completion (cron and CLI). */
export async function runScheduledSync(): Promise<void> {
  await executeSync(await claimSyncLease());
}

/**
 * Initialize and start the scheduler
 */
export function initializeScheduler(): void {
  // Validate cron expression
  const cronExpression = '0 2 * * 0,2,4'; // Every Sunday, Tuesday, Thursday at 2:00 AM

  if (env.FEC_API_KEY && !cron.validate(cronExpression)) {
    console.error('❌ Invalid cron expression:', cronExpression);
    return;
  }

  if (env.FEC_API_KEY) {
    // Schedule the job only when FEC access is configured.
    cron.schedule(
      cronExpression,
      async () => {
        console.log('\n⏰ Scheduled FEC sync triggered');
        try {
          await runScheduledSync();
        } catch (error) {
          console.error('❌ Scheduled sync failed:', error);
        }
      },
      {
        timezone: 'America/New_York', // Adjust to your timezone
      }
    );

    console.log('⏰ FEC Data Sync Scheduler initialized');
    console.log(`📅 Schedule: Every Sunday, Tuesday, Thursday at 2:00 AM EST\n`);
  } else {
    console.log('FEC sync scheduler disabled: FEC_API_KEY is not configured');
  }

  // Ideology scores change slowly (PRD calls for monthly refresh). Run on the
  // 1st of each month, independently of the FEC sync. Isolated and idempotent —
  // a failure here (e.g. blocked egress) is logged and never affects FEC syncs.
  const ideologyCron = '0 3 1 * *'; // 1st of the month, 3:00 AM
  if (cron.validate(ideologyCron)) {
    cron.schedule(
      ideologyCron,
      async () => {
        console.log('\n⏰ Scheduled ideology sync triggered');
        try {
          await syncIdeologyScores();
        } catch (error) {
          console.error('❌ Scheduled ideology sync failed:', error);
        }
      },
      { timezone: 'America/New_York' }
    );
    console.log('🧭 Ideology Sync Scheduler initialized');
    console.log(`📅 Schedule: 1st of each month at 3:00 AM EST\n`);
  }
}

/**
 * Manual trigger (callable from API). Resolves once the lease is held and the
 * sync has started; the run itself continues in the background because a full
 * sync takes far longer than any HTTP request may stay open.
 */
export async function triggerManualSync(): Promise<void> {
  if (!env.FEC_API_KEY) throw new Error('FEC_API_KEY is not configured; FEC sync is unavailable');
  console.log('\n🔧 Manual sync triggered via API');
  const leaseToken = await claimSyncLease();
  void executeSync(leaseToken).catch((error) => {
    console.error('❌ Manual sync failed:', error);
  });
}
