#!/usr/bin/env tsx
/**
 * Sync Financial Data for Existing Candidates
 *
 * This script fetches financial data from the FEC API for all candidates
 * currently in the database without syncing any new candidates.
 *
 * Usage:
 *   tsx src/scripts/sync-financials-only.ts [--cycle 2026] [--batch-size 10]
 */

import { prisma } from '../config/database.js';
import { financeService } from '../services/finance.service.js';

// Configuration - OPTIMIZED FOR SPEED
const CONFIG = {
  cycle: 2026,
  batchSize: 50, // Process 50 candidates at a time (5x faster!)
  delayBetweenBatches: 50, // ms delay between batches (reduced from 100ms)
  skipIfSyncedWithinHours: 6, // Skip candidates synced within last 6 hours
};

interface SyncStats {
  totalCandidates: number;
  candidatesProcessed: number;
  candidatesSkipped: number;
  financialsSynced: number;
  financialsErrors: number;
  duration: number;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process candidates in batches
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

    // Delay between batches to respect rate limits
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
}

/**
 * Main sync function
 */
async function syncFinancialsOnly(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    totalCandidates: 0,
    candidatesProcessed: 0,
    candidatesSkipped: 0,
    financialsSynced: 0,
    financialsErrors: 0,
    duration: 0,
  };

  console.log('\n' + '='.repeat(60));
  console.log('💰 Syncing Financial Data for Existing Candidates');
  console.log('='.repeat(60));
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🔄 Cycle: ${CONFIG.cycle}`);
  console.log(`⚡ Batch size: ${CONFIG.batchSize}`);
  console.log(`⏭️  Skip threshold: ${CONFIG.skipIfSyncedWithinHours} hours`);
  console.log('='.repeat(60) + '\n');

  try {
    // Calculate skip threshold
    const skipThreshold = new Date(
      Date.now() - CONFIG.skipIfSyncedWithinHours * 60 * 60 * 1000
    );

    // Get all candidates with their financial sync status
    console.log('📥 Fetching candidates from database...\n');
    const allCandidates = await prisma.candidate.findMany({
      where: {
        cycles: { hasSome: [CONFIG.cycle] },
      },
      select: {
        candidateId: true,
        name: true,
        state: true,
        office: true,
        party: true,
        financials: {
          where: { cycle: CONFIG.cycle },
          select: {
            lastUpdated: true,
            receipts: true,
            disbursements: true,
          },
          take: 1,
        },
      },
      orderBy: {
        state: 'asc',
      },
    });

    stats.totalCandidates = allCandidates.length;
    console.log(`📊 Found ${stats.totalCandidates} candidates for cycle ${CONFIG.cycle}\n`);

    // Filter to candidates that need syncing
    const candidatesToSync = allCandidates.filter((c) => {
      const lastSync = c.financials?.[0]?.lastUpdated;
      return !lastSync || new Date(lastSync) < skipThreshold;
    });

    stats.candidatesSkipped = allCandidates.length - candidatesToSync.length;

    console.log(`✅ Already synced (within ${CONFIG.skipIfSyncedWithinHours}h): ${stats.candidatesSkipped}`);
    console.log(`🔄 Need syncing: ${candidatesToSync.length}\n`);

    if (candidatesToSync.length === 0) {
      console.log('✨ All candidates are up to date! No syncing needed.\n');
      stats.duration = Date.now() - startTime;
      return stats;
    }

    console.log('💰 Starting financial data sync...\n');

    // Track progress with less verbose logging for speed
    let lastProgressLog = Date.now();
    const progressLogInterval = 2000; // Log every 2 seconds instead of every candidate

    // Process in parallel batches
    await processBatch(
      candidatesToSync,
      CONFIG.batchSize,
      async (candidate) => {
        try {
          const result = await financeService.syncCandidateFinancials(
            candidate.candidateId,
            CONFIG.cycle
          );

          stats.candidatesProcessed++;
          stats.financialsSynced += result.synced;
          stats.financialsErrors += result.errors;

          // Only log periodically or on errors to reduce overhead
          const now = Date.now();
          if (result.errors > 0 || now - lastProgressLog > progressLogInterval) {
            const progress = ((stats.candidatesProcessed / candidatesToSync.length) * 100).toFixed(1);
            const rate = stats.candidatesProcessed / ((now - startTime) / 1000);
            console.log(
              `⚡ Progress: ${stats.candidatesProcessed}/${candidatesToSync.length} (${progress}%) | ` +
              `Rate: ${rate.toFixed(1)}/sec | Synced: ${stats.financialsSynced} | Errors: ${stats.financialsErrors}`
            );
            lastProgressLog = now;
          }

          if (result.errors > 0) {
            const party = candidate.party?.substring(0, 3) || '???';
            const office = candidate.office === 'SENATE' ? 'SEN' : 'HSE';
            console.error(`  ❌ ${candidate.state}-${office} ${candidate.name} (${party}): Error`);
          }
        } catch (error: any) {
          stats.candidatesProcessed++;
          stats.financialsErrors++;
          console.error(`  ❌ ${candidate.name}: ${error.message}`);
        }
      },
      CONFIG.delayBetweenBatches
    );

    stats.duration = Date.now() - startTime;

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Financial Data Sync Complete!');
    console.log('='.repeat(60));
    console.log(`⏱️  Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`👥 Total Candidates: ${stats.totalCandidates}`);
    console.log(`✅ Processed: ${stats.candidatesProcessed}`);
    console.log(`⏭️  Skipped (recently synced): ${stats.candidatesSkipped}`);
    console.log(`💰 Financial records synced: ${stats.financialsSynced}`);
    console.log(`❌ Errors: ${stats.financialsErrors}`);
    console.log('='.repeat(60) + '\n');

    return stats;
  } catch (error) {
    console.error('\n❌ Fatal error during sync:', error);
    throw error;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): void {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--cycle' && args[i + 1]) {
      CONFIG.cycle = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--batch-size' && args[i + 1]) {
      CONFIG.batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--skip-hours' && args[i + 1]) {
      CONFIG.skipIfSyncedWithinHours = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--force') {
      // Force sync all candidates regardless of last sync time
      CONFIG.skipIfSyncedWithinHours = 0;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx src/scripts/sync-financials-only.ts [options]

Options:
  --cycle <year>        Election cycle year (default: 2026)
  --batch-size <num>    Number of candidates to process in parallel (default: 50)
  --skip-hours <num>    Skip candidates synced within this many hours (default: 6)
  --force               Force sync all candidates, ignore last sync time
  --help, -h            Show this help message

Examples:
  tsx src/scripts/sync-financials-only.ts
  tsx src/scripts/sync-financials-only.ts --cycle 2024
  tsx src/scripts/sync-financials-only.ts --batch-size 100
  tsx src/scripts/sync-financials-only.ts --force
      `);
      process.exit(0);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse command line arguments
    parseArgs();

    // Connect to database
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Run sync
    const stats = await syncFinancialsOnly();

    // Disconnect
    await prisma.$disconnect();
    console.log('✅ Database disconnected\n');

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run the script
main();
