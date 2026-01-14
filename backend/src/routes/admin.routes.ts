import { Router } from 'express';
import { adminController, verifyAdminAuth } from '../controllers/admin.controller.js';
import { deadlineController } from '../controllers/deadline.controller.js';

const router = Router();

// Public endpoint to verify password
router.post('/verify', (req, res) => adminController.verifyPassword(req, res));

// Protected endpoints (require x-admin-key header)
router.get('/stats', verifyAdminAuth, (req, res) => adminController.getStats(req, res));
router.get('/sync-status', verifyAdminAuth, (req, res) => adminController.getSyncStatus(req, res));
router.post('/sync', verifyAdminAuth, (req, res) => adminController.triggerSync(req, res));
router.post('/generate-elections', verifyAdminAuth, (req, res) => adminController.triggerGenerateElections(req, res));

// Deadline management (protected)
router.get('/deadlines', verifyAdminAuth, (req, res) => deadlineController.getAllDeadlines(req, res));
router.post('/deadlines', verifyAdminAuth, (req, res) => deadlineController.createDeadline(req, res));
router.put('/deadlines/:id', verifyAdminAuth, (req, res) => deadlineController.updateDeadline(req, res));
router.delete('/deadlines/:id', verifyAdminAuth, (req, res) => deadlineController.deleteDeadline(req, res));

export default router;

