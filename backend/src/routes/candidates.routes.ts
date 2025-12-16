import { Router } from 'express';
import { candidateController } from '../controllers/candidate.controller.js';

const router = Router();

// Get candidates with filters and pagination
router.get('/', (req, res) => candidateController.getCandidates(req, res));

// Get candidate by database ID
router.get('/:id', (req, res) => candidateController.getCandidateById(req, res));

// Get candidate by FEC candidate ID
router.get('/fec/:candidateId', (req, res) => candidateController.getCandidateByCandidateId(req, res));

// Get candidate finances
router.get('/:id/finances', (req, res) => candidateController.getCandidateFinances(req, res));

// Get candidate receipts
router.get('/:id/receipts', (req, res) => candidateController.getCandidateReceipts(req, res));

// Get candidate disbursements
router.get('/:id/disbursements', (req, res) => candidateController.getCandidateDisbursements(req, res));

export default router;
