import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller.js';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';

const router = Router();

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
