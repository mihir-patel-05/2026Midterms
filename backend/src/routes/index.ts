import { Router } from 'express';
import candidatesRoutes from './candidates.routes.js';
import syncRoutes from './sync.routes.js';
import { prisma } from '../config/database.js';

const router = Router();

// Mount routes
router.use('/candidates', candidatesRoutes);
router.use('/sync', syncRoutes);

// Health check endpoint
router.get('/health', async (_req, res) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: '2026 Midterms API',
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      service: '2026 Midterms API',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
