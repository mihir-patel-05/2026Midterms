#!/usr/bin/env tsx
/**
 * Optimized Cron Job: Sync All FEC Data
 * Uses parallel batching for 5-10x faster syncing
 *
 * Usage:
 *   tsx src/jobs/sync-all-data.ts
 */

import { prisma } from '../config/database.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';
import { electionService } from '../services/election.service.js';

// Configuration
const SYNC_CONFIG = {
  // States to sync (battleground states)
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC'],

  // Offices to sync
  offices: ['S', 'H'], // S = Senate, H = House

  // Cycles to sync
  cycles: [2026],

  // Max pages per FEC API request
  maxPagesPerRequest: 3,

  // Whether to sync financial data
  syncFinances: true,

  // Optimization settings
  batchSize: 5,                  // Process 5 candidates in parallel
  minDelayMs: 100,               // Minimum delay between batches
  skipIfSyncedWithinHours: 12,   // Skip if synced within last 12 hours
};

interface SyncStats {
  candidatesSynced: number;
  candidatesErrors: number;
  candidatesSkipped: number;
  financesSynced: number;
  financesErrors: number;
  committeesSynced: number;
  committeesErrors: number;
  electionsGenerated: number;
  candidateLinksCreated: number;
  electionsErrors: number;
  duration: number;
}

/**
 * Process items in parallel batches
 */
async function processBatch<T>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<void>,
  delayMs: number = 100
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processor));

    // Small delay between batches to respect rate limits
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
}

/**
 * Main sync function - OPTIMIZED
 */
async function syncAllData(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    candidatesSynced: 0,
    candidatesErrors: 0,
    candidatesSkipped: 0,
    financesSynced: 0,
    financesErrors: 0,
    committeesSynced: 0,
    committeesErrors: 0,
    electionsGenerated: 0,
    candidateLinksCreated: 0,
    electionsErrors: 0,
    duration: 0,
  };

  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting OPTIMIZED FEC Data Sync');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🗺️  States: ${SYNC_CONFIG.states.join(', ')}`);
  console.log(`🏛️  Offices: ${SYNC_CONFIG.offices.join(', ')}`);
  console.log(`⚡ Batch size: ${SYNC_CONFIG.batchSize} parallel requests`);
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Sync Candidates (parallel by state/office combinations)
    console.log('📥 STEP 1: Syncing Candidates\n');

    const candidatePromises = SYNC_CONFIG.states.flatMap(state =>
      SYNC_CONFIG.offices.map(office => ({ state, office }))
    );

    await processBatch(candidatePromises, SYNC_CONFIG.batchSize, async ({ state, office }) => {
      try {
        const result = await candidateService.syncCandidates({
          state,
          office,
          cycle: SYNC_CONFIG.cycles[0],
          maxPages: SYNC_CONFIG.maxPagesPerRequest,
        });
        stats.candidatesSynced += result.synced;
        stats.candidatesErrors += result.errors;
        console.log(`  ✅ ${state} ${office === 'S' ? 'Senate' : 'House'}: ${result.synced} candidates`);
      } catch (error: any) {
        console.error(`  ❌ ${state} ${office}:`, error.message);
        stats.candidatesErrors++;
      }
    }, 200);

    console.log(`\n📊 Candidate Sync Summary: ${stats.candidatesSynced} synced, ${stats.candidatesErrors} errors\n`);

    // Step 2: Sync Financials + Committees (combined, parallel)
    if (SYNC_CONFIG.syncFinances) {
      console.log('📥 STEP 2: Syncing Financial Data + Committees\n');

      const skipThreshold = new Date(Date.now() - SYNC_CONFIG.skipIfSyncedWithinHours * 60 * 60 * 1000);

      // Get candidates that need syncing (not recently synced)
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

      // Filter to candidates that need syncing
      const candidatesToSync = allCandidates.filter(c => {
        const lastSync = c.financials?.[0]?.lastUpdated;
        return !lastSync || new Date(lastSync) < skipThreshold;
      });

      stats.candidatesSkipped = allCandidates.length - candidatesToSync.length;
      console.log(`  📋 Total candidates: ${allCandidates.length}`);
      console.log(`  ⏭️  Skipped (recently synced): ${stats.candidatesSkipped}`);
      console.log(`  🔄 Need syncing: ${candidatesToSync.length}\n`);

      // Process in parallel batches
      await processBatch(candidatesToSync, SYNC_CONFIG.batchSize, async (candidate) => {
        try {
          // Sync financials and committees in PARALLEL for each candidate
          const [finResult, commResult] = await Promise.all([
            financeService.syncCandidateFinancials(candidate.candidateId, SYNC_CONFIG.cycles[0]),
            candidateService.syncCandidateCommittees(candidate.candidateId),
          ]);

          stats.financesSynced += finResult.synced;
          stats.financesErrors += finResult.errors;
          stats.committeesSynced += commResult.synced;
          stats.committeesErrors += commResult.errors;

          if (finResult.synced > 0 || commResult.synced > 0) {
            console.log(`  ✅ ${candidate.name}: finances=${finResult.synced}, committees=${commResult.synced}`);
          }
        } catch (error: any) {
          console.error(`  ❌ ${candidate.name}:`, error.message);
          stats.financesErrors++;
        }
      }, 150);

      console.log(`\n📊 Finance Sync Summary: ${stats.financesSynced} synced, ${stats.financesErrors} errors`);
      console.log(`📊 Committee Sync Summary: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors\n`);
    }

    // Step 3: Generate Elections from Candidate Data
    console.log('📥 STEP 3: Generating Elections from Candidates\n');

    try {
      const electionResult = await electionService.generateElections(SYNC_CONFIG.cycles[0]);
      stats.electionsGenerated = electionResult.electionsCreated;
      stats.candidateLinksCreated = electionResult.candidateLinksCreated;
      stats.electionsErrors = electionResult.errors;
    } catch (error: any) {
      console.error('  ❌ Election generation failed:', error.message);
      stats.electionsErrors++;
    }

    console.log(`\n📊 Elections Summary: ${stats.electionsGenerated} created, ${stats.candidateLinksCreated} candidate links, ${stats.electionsErrors} errors\n`);

    stats.duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('✅ FEC Data Sync Complete!');
    console.log('='.repeat(60));
    console.log(`⏱️  Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`👥 Candidates: ${stats.candidatesSynced} synced, ${stats.candidatesSkipped} skipped`);
    console.log(`💰 Finances: ${stats.financesSynced} synced, ${stats.financesErrors} errors`);
    console.log(`🏢 Committees: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors`);
    console.log(`🗳️  Elections: ${stats.electionsGenerated} created, ${stats.candidateLinksCreated} candidate links`);
    console.log('='.repeat(60) + '\n');

    return stats;
  } catch (error) {
    console.error('\n❌ Fatal error during sync:', error);
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
 * Main execution
 */
async function main() {
  try {
    // Connect to database
    await prisma.$connect();
    console.log('✅ Database connected');

    // Run sync
    const stats = await syncAllData();

    // Disconnect
    await prisma.$disconnect();
    console.log('✅ Database disconnected');

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync job failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the job
main();
