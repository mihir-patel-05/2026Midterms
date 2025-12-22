import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const router = Router();

// Configuration for full sync
const SYNC_CONFIG = {
  states: ['AZ', 'GA', 'NV', 'PA', 'WI', 'MI', 'NC'],
  offices: ['S', 'H'],
  cycles: [2026],
  batchSize: 5,
  skipIfSyncedWithinHours: 12,
};

/**
 * POST /api/sync/all
 * Trigger a full sync of all candidates and their financial data.
 * Protected by SYNC_API_KEY environment variable.
 * 
 * Usage: curl -X POST https://your-api.com/api/sync/all -H "x-sync-key: YOUR_KEY"
 */
router.post('/all', async (req, res) => {
  try {
    // Check for sync API key (optional security)
    const syncKey = req.headers['x-sync-key'] as string;
    const expectedKey = process.env.SYNC_API_KEY;
    
    if (expectedKey && syncKey !== expectedKey) {
      res.status(401).json({ error: 'Unauthorized: Invalid sync key' });
      return;
    }

    console.log('🚀 Starting full sync via API...');
    const startTime = Date.now();

    const stats = {
      candidatesSynced: 0,
      candidatesErrors: 0,
      candidatesSkipped: 0,
      financesSynced: 0,
      financesErrors: 0,
      committeesSynced: 0,
      committeesErrors: 0,
    };

    // Step 1: Sync candidates
    for (const state of SYNC_CONFIG.states) {
      for (const office of SYNC_CONFIG.offices) {
        try {
          const result = await candidateService.syncCandidates({
            state,
            office,
            cycle: SYNC_CONFIG.cycles[0],
            maxPages: 3,
          });
          stats.candidatesSynced += result.synced;
          stats.candidatesErrors += result.errors;
        } catch (error: any) {
          console.error(`Error syncing ${state} ${office}:`, error.message);
          stats.candidatesErrors++;
        }
      }
    }

    // Step 2: Sync financials + committees for candidates
    const skipThreshold = new Date(Date.now() - SYNC_CONFIG.skipIfSyncedWithinHours * 60 * 60 * 1000);
    
    const allCandidates = await prisma.candidate.findMany({
      where: { cycles: { hasSome: SYNC_CONFIG.cycles } },
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

    const candidatesToSync = allCandidates.filter(c => {
      const lastSync = c.financials?.[0]?.lastUpdated;
      return !lastSync || new Date(lastSync) < skipThreshold;
    });

    stats.candidatesSkipped = allCandidates.length - candidatesToSync.length;

    // Process in batches
    for (let i = 0; i < candidatesToSync.length; i += SYNC_CONFIG.batchSize) {
      const batch = candidatesToSync.slice(i, i + SYNC_CONFIG.batchSize);
      
      await Promise.all(batch.map(async (candidate) => {
        try {
          const [finResult, commResult] = await Promise.all([
            financeService.syncCandidateFinancials(candidate.candidateId, SYNC_CONFIG.cycles[0]),
            candidateService.syncCandidateCommittees(candidate.candidateId),
          ]);
          stats.financesSynced += finResult.synced;
          stats.financesErrors += finResult.errors;
          stats.committeesSynced += commResult.synced;
          stats.committeesErrors += commResult.errors;
        } catch (error: any) {
          console.error(`Error syncing ${candidate.name}:`, error.message);
          stats.financesErrors++;
        }
      }));

      // Small delay between batches
      if (i + SYNC_CONFIG.batchSize < candidatesToSync.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log(`✅ Full sync completed in ${duration} minutes`);

    res.json({
      message: 'Full sync completed',
      duration: `${duration} minutes`,
      stats,
    });
  } catch (error: any) {
    console.error('Error in full sync:', error);
    res.status(500).json({ error: 'Failed to complete sync', message: error.message });
  }
});

// Sync candidates from FEC API
router.post('/candidates', (req, res) => candidateController.syncCandidates(req, res));

// Sync committees for a specific candidate
router.post('/committees/:candidateId', async (req, res) => {
  try {
    const { candidateId } = req.params;
    const result = await candidateService.syncCandidateCommittees(candidateId);
    res.json({
      message: 'Committee sync completed',
      ...result,
    });
  } catch (error: any) {
    console.error('Error syncing committees:', error);
    res.status(500).json({ error: 'Failed to sync committees', message: error.message });
  }
});

// Sync financial summary for a committee
router.post('/finances/:committeeId', async (req, res) => {
  try {
    const { committeeId } = req.params;
    const { cycle } = req.body;
    const result = await financeService.syncFinancialSummary(
      committeeId,
      cycle ? parseInt(cycle) : undefined
    );
    res.json({
      message: 'Financial summary sync completed',
      ...result,
    });
  } catch (error: any) {
    console.error('Error syncing financial summary:', error);
    res.status(500).json({ error: 'Failed to sync financial summary', message: error.message });
  }
});

// Sync receipts for a committee
router.post('/receipts/:committeeId', async (req, res) => {
  try {
    const { committeeId } = req.params;
    const { twoYearTransactionPeriod, minDate, maxDate, maxPages } = req.body;

    const result = await financeService.syncReceipts({
      committeeId,
      twoYearTransactionPeriod: twoYearTransactionPeriod ? parseInt(twoYearTransactionPeriod) : undefined,
      minDate,
      maxDate,
      maxPages: maxPages ? parseInt(maxPages) : undefined,
    });

    res.json({
      message: 'Receipts sync completed',
      ...result,
    });
  } catch (error: any) {
    console.error('Error syncing receipts:', error);
    res.status(500).json({ error: 'Failed to sync receipts', message: error.message });
  }
});

// Sync disbursements for a committee
router.post('/disbursements/:committeeId', async (req, res) => {
  try {
    const { committeeId } = req.params;
    const { twoYearTransactionPeriod, minDate, maxDate, maxPages } = req.body;

    const result = await financeService.syncDisbursements({
      committeeId,
      twoYearTransactionPeriod: twoYearTransactionPeriod ? parseInt(twoYearTransactionPeriod) : undefined,
      minDate,
      maxDate,
      maxPages: maxPages ? parseInt(maxPages) : undefined,
    });

    res.json({
      message: 'Disbursements sync completed',
      ...result,
    });
  } catch (error: any) {
    console.error('Error syncing disbursements:', error);
    res.status(500).json({ error: 'Failed to sync disbursements', message: error.message });
  }
});

export default router;
