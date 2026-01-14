import { Router } from 'express';
import { electionController } from '../controllers/election.controller.js';

const router = Router();

// Get state election counts (must come before /states/:state to avoid conflict)
router.get('/states/counts', (req, res) => electionController.getStateElectionCounts(req, res));

// Get elections for a specific state
router.get('/states/:state', (req, res) => electionController.getElectionsByState(req, res));

// Get all elections with filters and pagination
router.get('/', (req, res) => electionController.getElections(req, res));

// Get election by ID
router.get('/:id', (req, res) => electionController.getElectionById(req, res));

// Generate elections from candidate data
router.post('/generate', (req, res) => electionController.generateElections(req, res));

// Create a new election
router.post('/', (req, res) => electionController.createElection(req, res));

// Update an election
router.put('/:id', (req, res) => electionController.updateElection(req, res));

// Delete an election
router.delete('/:id', (req, res) => electionController.deleteElection(req, res));

export default router;
