import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller.js';

const router = Router();

// Get candidates with filters and pagination
router.get('/', (req, res) => candidateController.getCandidates(req, res));

// Get candidate by FEC candidate ID (must come before /:id to avoid conflict)
router.get('/fec/:candidateId', (req, res) => candidateController.getCandidateByCandidateId(req, res));

// Get candidate by database ID
router.get('/:id', (req, res) => candidateController.getCandidateById(req, res));

// Get detailed candidate finances (funding sources, top donors, spending categories)
router.get('/:id/finances/detailed', (req, res) => candidateController.getCandidateDetailedFinances(req, res));

// Get candidate finances (basic summary)
router.get('/:id/finances', (req, res) => candidateController.getCandidateFinances(req, res));

// Get candidate receipts
router.get('/:id/receipts', (req, res) => candidateController.getCandidateReceipts(req, res));

// Get candidate disbursements
router.get('/:id/disbursements', (req, res) => candidateController.getCandidateDisbursements(req, res));

// Manually sync candidate data from FEC API (for refreshing stale data)
router.post('/:id/sync', (req, res) => candidateController.syncCandidateData(req, res));

export default router;
