import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import routes from './routes/index.js';
import { initializeScheduler } from './jobs/scheduler.js';
import { kalshiLiveFeed } from './services/kalshi/live-feed.js';

const app: Application = express();

// Railway terminates TLS at one proxy hop. Trust it so req.ip is the visitor's address,
// otherwise every visitor shares the proxy's IP and one rate-limit bucket.
app.set('trust proxy', 1);

// Railway service URLs are bare hosts; CORS compares against full origins.
const toOrigin = (host?: string) =>
  host ? (/^https?:\/\//.test(host) ? host : `https://${host}`).replace(/\/+$/, '') : undefined;

const allowedOrigins = [
  env.FRONTEND_URL ?? toOrigin(env.RAILWAY_SERVICE_FRONTEND_URL),
  env.ADMIN_URL ?? toOrigin(env.RAILWAY_SERVICE_ADMIN_DASHBOARD_URL),
  ...(env.NODE_ENV !== 'production'
    ? [
        'http://localhost:8080',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ]
    : []),
]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.replace(/\/+$/, ''));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, origin);
    } else {
      // Omit CORS headers so the browser blocks it, instead of a 500 from the error handler.
      console.warn(`[CORS] Rejected origin ${origin}; allowed: ${allowedOrigins.join(', ')}`);
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for public API endpoints
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Higher limit for admin endpoints (dashboard polls frequently)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/admin', adminLimiter);
app.use('/api', publicLimiter);

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.path} ${res.statusCode} - ${duration}ms`
    );
  });
  next();
});

// Mount API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '2026 Midterms API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      candidates: '/api/candidates',
      sync: '/api/sync',
    },
    documentation: 'https://github.com/yourusername/2026midterms',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
const startServer = async () => {
  const port = env.PORT;

  // Start listening independently from database readiness. Kubernetes/Railway
  // and Docker can now distinguish a live process from a ready dependency via
  // /api/health (503 until PostgreSQL becomes reachable).
  app.listen(port, () => {
    console.log(`\n🚀 Server is running on port ${port}`);
    console.log(`📡 Environment: ${env.NODE_ENV}`);
    console.log(`🔗 API available at: http://localhost:${port}/api`);
    console.log(`📊 Health check: http://localhost:${port}/api/health\n`);
  });

  initializeScheduler();
  void kalshiLiveFeed.start().catch((error) => console.error('❌ Kalshi live feed failed to start:', error));

  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('⚠️  Database unavailable at startup; health endpoint will report 503:', error);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  kalshiLiveFeed.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  kalshiLiveFeed.stop();
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();
