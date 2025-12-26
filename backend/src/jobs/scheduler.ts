/**
 * FEC Data Sync Scheduler
 * Runs automated data synchronization jobs on a weekly schedule
 * 
 * Schedule: Every Sunday at 2:00 AM
 * Cron expression: '0 2 * * 0'
 */

import cron from 'node-cron';
import { prisma } from '../config/database.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';

// Configuration for scheduled syncs
const SYNC_CONFIG = {
  // Battleground states (can be expanded to all states)
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC', 'FL', 'OH', 'TX'],
  
  // Offices to sync
  offices: ['S', 'H'], // S = Senate, H = House
  
  // Current election cycle
  cycles: [2026],
  
  // Batch processing size
  batchSize: 5,
  
  // Skip candidates synced within this timeframe
  skipIfSyncedWithinHours: 12,
  
  // Max pages per API request
  maxPagesPerRequest: 3,
};

interface SyncStats {
  candidatesSynced: number;
  candidatesErrors: number;
  candidatesSkipped: number;
  financesSynced: number;
  financesErrors: number;
  committeesSynced: number;
  committeesErrors: number;
  duration: number;
}

/**
 * Main sync function with SyncLog tracking
 */
async function runScheduledSync(): Promise<void> {
  const startTime = Date.now();
  
  // Create initial sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      syncType: 'full',
      status: 'started',
      metadata: {
        states: SYNC_CONFIG.states,
        offices: SYNC_CONFIG.offices,
        cycles: SYNC_CONFIG.cycles,
        scheduledSync: true,
      },
    },
  });

  console.log('\n' + '='.repeat(70));
  console.log('🔄 SCHEDULED FEC DATA SYNC STARTED');
  console.log('='.repeat(70));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🆔 Sync Log ID: ${syncLog.id}`);
  console.log(`🗺️  States: ${SYNC_CONFIG.states.join(', ')}`);
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
    duration: 0,
  };

  try {
    // Update status to running
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'running' },
    });

    // Step 1: Sync Candidates
    console.log('📥 STEP 1: Syncing Candidates\n');

    for (const state of SYNC_CONFIG.states) {
      for (const office of SYNC_CONFIG.offices) {
        try {
          const result = await candidateService.syncCandidates({
            state,
            office,
            cycle: SYNC_CONFIG.cycles[0],
            maxPages: SYNC_CONFIG.maxPagesPerRequest,
          });
          
          stats.candidatesSynced += result.synced;
          stats.candidatesErrors += result.errors;
          
          console.log(
            `  ✅ ${state} ${office === 'S' ? 'Senate' : 'House'}: ${result.synced} candidates`
          );
        } catch (error: any) {
          console.error(`  ❌ ${state} ${office}:`, error.message);
          stats.candidatesErrors++;
        }

        // Small delay between requests
        await sleep(150);
      }
    }

    console.log(
      `\n📊 Candidate Sync Summary: ${stats.candidatesSynced} synced, ${stats.candidatesErrors} errors\n`
    );

    // Step 2: Sync Financials + Committees
    console.log('📥 STEP 2: Syncing Financial Data + Committees\n');

    const skipThreshold = new Date(
      Date.now() - SYNC_CONFIG.skipIfSyncedWithinHours * 60 * 60 * 1000
    );

    // Get candidates that need syncing
    const allCandidates = await prisma.candidate.findMany({
      where: {
        cycles: { hasSome: SYNC_CONFIG.cycles },
      },
      select: {
        candidateId: true,
        name: true,
        financials: {
          where: { cycle: SYNC_CONFIG.cycles[0] },
          select: { lastUpdated: true },
          take: 1,
        },
      },
    });

    // Filter candidates needing sync
    const candidatesToSync = allCandidates.filter((c) => {
      const lastSync = c.financials?.[0]?.lastUpdated;
      return !lastSync || new Date(lastSync) < skipThreshold;
    });

    stats.candidatesSkipped = allCandidates.length - candidatesToSync.length;
    
    console.log(`  📋 Total candidates: ${allCandidates.length}`);
    console.log(`  ⏭️  Skipped (recently synced): ${stats.candidatesSkipped}`);
    console.log(`  🔄 Need syncing: ${candidatesToSync.length}\n`);

    // Process in batches
    for (let i = 0; i < candidatesToSync.length; i += SYNC_CONFIG.batchSize) {
      const batch = candidatesToSync.slice(i, i + SYNC_CONFIG.batchSize);

      await Promise.all(
        batch.map(async (candidate) => {
          try {
            const [finResult, commResult] = await Promise.all([
              financeService.syncCandidateFinancials(
                candidate.candidateId,
                SYNC_CONFIG.cycles[0]
              ),
              candidateService.syncCandidateCommittees(candidate.candidateId),
            ]);

            stats.financesSynced += finResult.synced;
            stats.financesErrors += finResult.errors;
            stats.committeesSynced += commResult.synced;
            stats.committeesErrors += commResult.errors;

            if (finResult.synced > 0 || commResult.synced > 0) {
              console.log(
                `  ✅ ${candidate.name}: finances=${finResult.synced}, committees=${commResult.synced}`
              );
            }
          } catch (error: any) {
            console.error(`  ❌ ${candidate.name}:`, error.message);
            stats.financesErrors++;
          }
        })
      );

      // Delay between batches
      if (i + SYNC_CONFIG.batchSize < candidatesToSync.length) {
        await sleep(200);
      }
    }

    console.log(
      `\n📊 Finance Sync Summary: ${stats.financesSynced} synced, ${stats.financesErrors} errors`
    );
    console.log(
      `📊 Committee Sync Summary: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors\n`
    );

    stats.duration = Date.now() - startTime;

    // Update sync log as completed
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        recordsProcessed:
          stats.candidatesSynced + stats.financesSynced + stats.committeesSynced,
        recordsErrors:
          stats.candidatesErrors + stats.financesErrors + stats.committeesErrors,
        recordsSkipped: stats.candidatesSkipped,
        completedAt: new Date(),
        duration: stats.duration,
        metadata: {
          ...syncLog.metadata,
          stats,
        },
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
    console.log('='.repeat(70) + '\n');
  } catch (error: any) {
    console.error('\n❌ Fatal error during scheduled sync:', error);

    // Update sync log as failed
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      },
    });

    throw error;
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize and start the scheduler
 */
export function initializeScheduler(): void {
  // Validate cron expression
  const cronExpression = '0 2 * * 0'; // Every Sunday at 2:00 AM
  
  if (!cron.validate(cronExpression)) {
    console.error('❌ Invalid cron expression:', cronExpression);
    return;
  }

  // Schedule the job
  const scheduledTask = cron.schedule(
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
      scheduled: true,
      timezone: 'America/New_York', // Adjust to your timezone
    }
  );

  console.log('⏰ FEC Data Sync Scheduler initialized');
  console.log(`📅 Schedule: Every Sunday at 2:00 AM EST`);
  console.log(`🔄 Next run: ${scheduledTask.nextDates().toJSDate()}\n`);
}

/**
 * Manual trigger for testing (callable from API)
 */
export async function triggerManualSync(): Promise<void> {
  console.log('\n🔧 Manual sync triggered via API');
  await runScheduledSync();
}

