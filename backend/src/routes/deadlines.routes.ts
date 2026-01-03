import { Router } from 'express';
import { deadlineController } from '../controllers/deadline.controller.js';

const router = Router();

// Public endpoint - Get active upcoming deadlines
router.get('/', (req, res) => deadlineController.getPublicDeadlines(req, res));

export default router;

