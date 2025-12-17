#!/usr/bin/env tsx
/**
 * Cron Job: Sync All FEC Data
 *
 * This script syncs candidates and their campaign finance data from the FEC API.
 * Designed to run on a schedule (e.g., Mon/Wed/Fri) via Railway cron jobs.
 *
 * Usage:
 *   tsx src/jobs/sync-all-data.ts
 */

import { prisma } from '../config/database.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';

// Configuration for what to sync
const SYNC_CONFIG = {
  // States to sync (add more as needed)
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC'], // Battleground states

  // Offices to sync
  offices: ['S', 'H'], // S = Senate, H = House

  // Cycles to sync - only the 2026 midterm cycle
  cycles: [2026],

  // Max pages per request (to avoid rate limits)
  maxPagesPerRequest: 3,

  // Whether to sync financial data
  syncFinances: true,

  // Transaction periods for receipts/disbursements (last 4 years only)
  transactionPeriods: [2024, 2026],

  // Max pages for receipts/disbursements (these can be very large)
  maxFinancePages: 2,
};

interface SyncStats {
  candidatesSynced: number;
  candidatesErrors: number;
  committeesSynced: number;
  committeesErrors: number;
  financesSynced: number;
  financesErrors: number;
  receiptsSynced: number;
  receiptsErrors: number;
  disbursementsSynced: number;
  disbursementsErrors: number;
  duration: number;
}

/**
 * Main sync function
 */
async function syncAllData(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    candidatesSynced: 0,
    candidatesErrors: 0,
    committeesSynced: 0,
    committeesErrors: 0,
    financesSynced: 0,
    financesErrors: 0,
    receiptsSynced: 0,
    receiptsErrors: 0,
    disbursementsSynced: 0,
    disbursementsErrors: 0,
    duration: 0,
  };

  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting FEC Data Sync');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🗺️  States: ${SYNC_CONFIG.states.join(', ')}`);
  console.log(`🏛️  Offices: ${SYNC_CONFIG.offices.join(', ')}`);
  console.log(`📊 Cycles: ${SYNC_CONFIG.cycles.join(', ')}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Step 1: Sync Candidates
    console.log('📥 STEP 1: Syncing Candidates\n');

    for (const state of SYNC_CONFIG.states) {
      for (const office of SYNC_CONFIG.offices) {
        for (const cycle of SYNC_CONFIG.cycles) {
          try {
            console.log(`  ➡️  Syncing ${state} ${office === 'S' ? 'Senate' : 'House'} ${cycle}...`);

            const result = await candidateService.syncCandidates({
              state,
              office,
              cycle,
              maxPages: SYNC_CONFIG.maxPagesPerRequest,
            });

            stats.candidatesSynced += result.synced;
            stats.candidatesErrors += result.errors;

            console.log(`  ✅ Synced ${result.synced} candidates (${result.errors} errors)\n`);

            // Small delay to respect rate limits
            await sleep(1000);
          } catch (error: any) {
            console.error(`  ❌ Error syncing ${state} ${office} ${cycle}:`, error.message);
            stats.candidatesErrors++;
          }
        }
      }
    }

    console.log(`\n📊 Candidate Sync Summary: ${stats.candidatesSynced} synced, ${stats.candidatesErrors} errors\n`);

    // Step 2: Sync Committees for all candidates
    if (SYNC_CONFIG.syncFinances) {
      console.log('📥 STEP 2: Syncing Committees\n');

      // Get all candidates from the database
      const allCandidates = await prisma.candidate.findMany({
        where: {
          cycles: {
            hasSome: SYNC_CONFIG.cycles,
          },
        },
        select: {
          candidateId: true,
          name: true,
        },
      });

      console.log(`  Found ${allCandidates.length} candidates to sync committees for\n`);

      for (const candidate of allCandidates) {
        try {
          const result = await candidateService.syncCandidateCommittees(candidate.candidateId);
          stats.committeesSynced += result.synced;
          stats.committeesErrors += result.errors;

          if (result.synced > 0) {
            console.log(`  ✅ ${candidate.name}: ${result.synced} committees`);
          }

          await sleep(500);
        } catch (error: any) {
          console.error(`  ❌ Error syncing committees for ${candidate.name}:`, error.message);
          stats.committeesErrors++;
        }
      }

      console.log(`\n📊 Committee Sync Summary: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors\n`);

      // Step 3: Sync Financial Summaries
      console.log('📥 STEP 3: Syncing Financial Summaries\n');

      const allCommittees = await prisma.committee.findMany({
        select: {
          committeeId: true,
          name: true,
        },
      });

      console.log(`  Found ${allCommittees.length} committees to sync finances for\n`);

      for (const committee of allCommittees) {
        try {
          for (const cycle of SYNC_CONFIG.cycles) {
            const result = await financeService.syncFinancialSummary(committee.committeeId, cycle);
            stats.financesSynced += result.synced;
            stats.financesErrors += result.errors;
          }

          await sleep(500);
        } catch (error: any) {
          console.error(`  ❌ Error syncing finances for ${committee.name}:`, error.message);
          stats.financesErrors++;
        }
      }

      console.log(`\n📊 Finance Sync Summary: ${stats.financesSynced} synced, ${stats.financesErrors} errors\n`);

      // Step 4: Sync Receipts (limited to avoid overwhelming the database)
      console.log('📥 STEP 4: Syncing Receipts (Sample)\n');

      // Only sync receipts for a subset of committees to avoid rate limits
      const topCommittees = allCommittees.slice(0, 10);
      console.log(`  Syncing receipts for top ${topCommittees.length} committees\n`);

      for (const committee of topCommittees) {
        try {
          for (const period of SYNC_CONFIG.transactionPeriods) {
            const result = await financeService.syncReceipts({
              committeeId: committee.committeeId,
              twoYearTransactionPeriod: period,
              maxPages: SYNC_CONFIG.maxFinancePages,
            });

            stats.receiptsSynced += result.synced;
            stats.receiptsErrors += result.errors;
          }

          await sleep(1000);
        } catch (error: any) {
          console.error(`  ❌ Error syncing receipts for ${committee.name}:`, error.message);
          stats.receiptsErrors++;
        }
      }

      console.log(`\n📊 Receipts Sync Summary: ${stats.receiptsSynced} synced, ${stats.receiptsErrors} errors\n`);
    }

    stats.duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(60));
    console.log('✅ FEC Data Sync Complete!');
    console.log('='.repeat(60));
    console.log(`⏱️  Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`👥 Candidates: ${stats.candidatesSynced} synced, ${stats.candidatesErrors} errors`);
    console.log(`🏢 Committees: ${stats.committeesSynced} synced, ${stats.committeesErrors} errors`);
    console.log(`💰 Finances: ${stats.financesSynced} synced, ${stats.financesErrors} errors`);
    console.log(`📨 Receipts: ${stats.receiptsSynced} synced, ${stats.receiptsErrors} errors`);
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
