import { Request, Response, Router } from 'express';
import { candidateController } from '../controllers/candidate.controller.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';
import { prisma } from '../config/database.js';
import { triggerManualSync } from '../jobs/scheduler.js';
import { verifySyncAuth } from '../middleware/sync-auth.js';
import { SyncAlreadyRunningError } from '../services/sync-lock.service.js';

const router = Router();

// All sync operations and their logs are operational endpoints. They must
// never become public merely because an environment variable is missing.
router.use(verifySyncAuth);

/**
 * POST /api/sync/full
 * Trigger a full sync of all candidates and their financial data (same as scheduler runs).
 * Protected by SYNC_API_KEY environment variable.
 * 
 * Usage: curl -X POST http://localhost:3001/api/sync/full -H "x-sync-key: YOUR_KEY"
 */
const runFullSync = async (_req: Request, res: Response) => {
  try {
    await triggerManualSync();

    res.json({
      message: 'Full sync completed successfully',
      note: 'Check console logs for detailed progress',
    });
  } catch (error: any) {
    console.error('Error in full sync:', error);
    if (error instanceof SyncAlreadyRunningError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ 
      error: 'Failed to complete sync', 
      message: error.message 
    });
  }
};

router.post('/full', runFullSync);

/**
 * POST /api/sync/all
 * Legacy endpoint - redirects to /api/sync/full
 */
router.post('/all', runFullSync);

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

/**
 * GET /api/sync/status
 * Get the status of recent sync jobs
 * 
 * Query params:
 *   - limit: Number of sync logs to return (default: 10)
 *   - syncType: Filter by sync type (candidates, finance, full, committees)
 */
router.get('/status', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const syncType = req.query.syncType as string;

    const syncLogs = await prisma.syncLog.findMany({
      where: syncType ? { syncType } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        syncType: true,
        status: true,
        recordsProcessed: true,
        recordsErrors: true,
        recordsSkipped: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        duration: true,
        metadata: true,
      },
    });

    // Get summary stats
    const totalSyncs = await prisma.syncLog.count();
    const completedSyncs = await prisma.syncLog.count({
      where: { status: 'completed' },
    });
    const failedSyncs = await prisma.syncLog.count({
      where: { status: 'failed' },
    });

    // Get last successful sync
    const lastSuccessfulSync = await prisma.syncLog.findFirst({
      where: { status: 'completed' },
      orderBy: { completedAt: 'desc' },
      select: {
        syncType: true,
        completedAt: true,
        recordsProcessed: true,
        duration: true,
      },
    });

    res.json({
      summary: {
        totalSyncs,
        completedSyncs,
        failedSyncs,
        lastSuccessfulSync,
      },
      recentSyncs: syncLogs,
    });
  } catch (error: any) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync status', 
      message: error.message 
    });
  }
});

/**
 * GET /api/sync/logs/:id
 * Get detailed information about a specific sync log
 */
router.get('/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const syncLog = await prisma.syncLog.findUnique({
      where: { id },
    });

    if (!syncLog) {
      res.status(404).json({ error: 'Sync log not found' });
      return;
    }

    res.json(syncLog);
  } catch (error: any) {
    console.error('Error fetching sync log:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync log', 
      message: error.message 
    });
  }
});

export default router;
