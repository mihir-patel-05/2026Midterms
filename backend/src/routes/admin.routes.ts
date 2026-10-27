import { Router } from 'express';
import { adminController, verifyAdminAuth } from '../controllers/admin.controller.js';
import { deadlineController } from '../controllers/deadline.controller.js';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { getNewsStatus } from '../services/news/news-status.js';
import { newsBudgetLimits } from '../services/news/run-news-cycle.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// Public endpoint to verify password
router.post('/verify', loginLimiter, (req, res) => adminController.verifyPassword(req, res));

// Protected endpoints (require x-admin-key header)
router.post('/logout', verifyAdminAuth, (req, res) => adminController.logout(req, res));
router.get('/stats', verifyAdminAuth, (req, res) => adminController.getStats(req, res));
router.get('/sync-status', verifyAdminAuth, (req, res) => adminController.getSyncStatus(req, res));
// News job: spend against the caps, recent runs, and the AI picks next to the trending order.
router.get('/news-status', verifyAdminAuth, async (_req, res) => {
  try {
    const data = await getNewsStatus(prisma, {
      limits: newsBudgetLimits(),
      settings: {
        ingestEnabled: env.NEWS_INGEST_ENABLED,
        agentsEnabled: env.NEWS_AGENTS_ENABLED,
        schedulerInProcess: env.NEWS_SCHEDULER_IN_PROCESS,
        actorId: env.APIFY_NEWS_ACTOR_ID ?? null,
        pickerModel: env.NEWS_PICKER_MODEL,
      },
    });
    res.json(data);
  } catch (error) {
    console.error('News status failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'News status is unavailable' });
  }
});
router.post('/sync', verifyAdminAuth, (req, res) => adminController.triggerSync(req, res));
router.post('/generate-elections', verifyAdminAuth, (req, res) => adminController.triggerGenerateElections(req, res));

// Deadline management (protected)
router.get('/deadlines', verifyAdminAuth, (req, res) => deadlineController.getAllDeadlines(req, res));
router.post('/deadlines', verifyAdminAuth, (req, res) => deadlineController.createDeadline(req, res));
router.put('/deadlines/:id', verifyAdminAuth, (req, res) => deadlineController.updateDeadline(req, res));
router.delete('/deadlines/:id', verifyAdminAuth, (req, res) => deadlineController.deleteDeadline(req, res));

export default router;
