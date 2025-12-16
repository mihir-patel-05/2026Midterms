import { Router } from 'express';
import candidatesRoutes from './candidates.routes.js';
import syncRoutes from './sync.routes.js';

const router = Router();

// Mount routes
router.use('/candidates', candidatesRoutes);
router.use('/sync', syncRoutes);

// Health check endpoint
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '2026 Midterms API',
  });
});

export default router;
