import { Router, type Request, type Response } from 'express';
import candidatesRoutes from './candidates.routes.js';
import syncRoutes from './sync.routes.js';
import electionsRoutes from './elections.routes.js';
import adminRoutes from './admin.routes.js';
import deadlinesRoutes from './deadlines.routes.js';
import chatRoutes from './chat.routes.js';
import researcherAuthRoutes from './researcher-auth.routes.js';
import researchRoutes from './research.routes.js';
import { candidateController } from '../controllers/candidate.controller.js';
import { prisma } from '../config/database.js';

const router = Router();

// Mount routes
router.use('/candidates', candidatesRoutes);
router.use('/sync', syncRoutes);
router.use('/elections', electionsRoutes);
router.use('/admin', adminRoutes);
router.use('/deadlines', deadlinesRoutes);
router.use('/chat', chatRoutes);
router.use('/auth/researcher', researcherAuthRoutes);
router.use('/research', researchRoutes);

// Static catalog of supported lobbies (for UI legends/filters)
router.get('/lobbies', (req, res) => candidateController.getLobbyCatalog(req, res));

// Liveness intentionally avoids database/provider calls. Railway and container
// smoke tests can use this to determine whether the HTTP process is running.
router.get('/health/live', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '2026 Midterms API',
  });
});

const readinessHandler = async (_req: Request, res: Response) => {
  try {
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
};

// Readiness is database-aware but deliberately independent of upstream result
// providers so the API can continue serving a last-known-good snapshot.
router.get('/health/ready', readinessHandler);

// Preserve the original endpoint for existing deployments and monitors.
router.get('/health', readinessHandler);

export default router;
