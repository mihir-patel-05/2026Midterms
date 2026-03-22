import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { candidateService } from '../services/candidate.service.js';
import { electionService } from '../services/election.service.js';
import bcrypt from 'bcrypt';

// Session store for admin tokens (in production, use Redis or similar)
const adminSessions = new Map<string, { username: string; expiresAt: number }>();

console.log('🔐 Admin authentication configured: Database-based authentication');

/**
 * Middleware to verify admin authentication
 */
export async function verifyAdminAuth(req: Request, res: Response, next: Function) {
  const authToken = req.headers['x-admin-key'] as string;

  if (!authToken) {
    res.status(401).json({ error: 'Unauthorized', message: 'No authentication token provided' });
    return;
  }

  // Check if session exists and is valid
  const session = adminSessions.get(authToken);
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      adminSessions.delete(authToken);
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Session expired or invalid' });
    return;
  }

  // Verify user still exists and is active
  const adminUser = await prisma.adminUser.findUnique({
    where: { username: session.username }
  });

  if (!adminUser || !adminUser.isActive) {
    adminSessions.delete(authToken);
    res.status(401).json({ error: 'Unauthorized', message: 'User not found or inactive' });
    return;
  }

  next();
}

export class AdminController {
  /**
   * POST /api/admin/verify
   * Verify admin credentials and create session
   */
  async verifyPassword(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body;
    
    console.log('🔐 Login attempt for username:', username);

    if (!username || !password) {
      console.log('🔍 Login failed: Missing username or password');
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    try {
      // Check if any admin users exist at all
      const adminCount = await prisma.adminUser.count();
      console.log(`📊 Total admin users in database: ${adminCount}`);
      
      if (adminCount === 0) {
        console.log('❌ No admin users exist! Run: npm run admin:create');
        res.status(401).json({ 
          error: 'No admin users configured',
          hint: 'Run "npm run admin:create" in the backend directory'
        });
        return;
      }

      // Find admin user by username
      const adminUser = await prisma.adminUser.findUnique({
        where: { username }
      });

      if (!adminUser || !adminUser.isActive) {
        console.log('🔍 Login attempt failed:', username);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);

      if (!isValidPassword) {
        console.log('🔍 Login attempt failed:', username);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Generate session token (use crypto for production)
      const sessionToken = `${adminUser.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      // Store session
      adminSessions.set(sessionToken, {
        username: adminUser.username,
        expiresAt
      });

      // Update last login
      await prisma.adminUser.update({
        where: { id: adminUser.id },
        data: { lastLoginAt: new Date() }
      });

      console.log('✅ Admin login successful:', username);

      res.json({
        success: true,
        message: 'Authentication successful',
        token: sessionToken,
        expiresAt: new Date(expiresAt).toISOString()
      });
    } catch (error: any) {
      console.error('Error during login:', error);
      res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
  }

  /**
   * POST /api/admin/logout
   * Invalidate the current session
   */
  async logout(req: Request, res: Response): Promise<void> {
    const authToken = req.headers['x-admin-key'] as string;
    if (authToken) {
      adminSessions.delete(authToken);
    }
    res.json({ message: 'Logged out successfully' });
  }

  /**
   * GET /api/admin/stats
   * Get database statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const [
        candidateCount,
        electionCount,
        committeeCount,
        stateCount,
        lastSyncLog,
      ] = await Promise.all([
        prisma.candidate.count(),
        prisma.election.count(),
        prisma.committee.count(),
        prisma.candidate.groupBy({
          by: ['state'],
          _count: true,
        }),
        prisma.syncLog.findFirst({
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
        }),
      ]);

      res.json({
        candidates: candidateCount,
        elections: electionCount,
        committees: committeeCount,
        statesWithCandidates: stateCount.length,
        lastSync: lastSyncLog ? {
          type: lastSyncLog.syncType,
          completedAt: lastSyncLog.completedAt,
          recordsProcessed: lastSyncLog.recordsProcessed,
          duration: lastSyncLog.duration,
        } : null,
      });
    } catch (error: any) {
      console.error('Error getting admin stats:', error);
      res.status(500).json({ error: 'Failed to get stats', message: error.message });
    }
  }

  /**
   * GET /api/admin/sync-status
   * Get sync status and recent logs
   */
  async getSyncStatus(req: Request, res: Response): Promise<void> {
    try {
      // Get recent sync logs
      const recentLogs = await prisma.syncLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
      });

      // Check if there's a currently running sync
      const runningSync = await prisma.syncLog.findFirst({
        where: { status: { in: ['started', 'running'] } },
        orderBy: { startedAt: 'desc' },
      });

      res.json({
        isRunning: !!runningSync,
        currentSync: runningSync ? {
          id: runningSync.id,
          type: runningSync.syncType,
          status: runningSync.status,
          startedAt: runningSync.startedAt,
          recordsProcessed: runningSync.recordsProcessed,
        } : null,
        recentLogs: recentLogs.map(log => ({
          id: log.id,
          type: log.syncType,
          status: log.status,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
          recordsProcessed: log.recordsProcessed,
          recordsErrors: log.recordsErrors,
          duration: log.duration,
          errorMessage: log.errorMessage,
        })),
      });
    } catch (error: any) {
      console.error('Error getting sync status:', error);
      res.status(500).json({ error: 'Failed to get sync status', message: error.message });
    }
  }

  /**
   * POST /api/admin/sync
   * Trigger a full FEC data sync
   */
  async triggerSync(req: Request, res: Response): Promise<void> {
    try {
      // Check if a sync is already running
      const runningSync = await prisma.syncLog.findFirst({
        where: { status: { in: ['started', 'running'] } },
      });

      if (runningSync) {
        res.status(409).json({
          error: 'Sync already in progress',
          syncId: runningSync.id,
          startedAt: runningSync.startedAt,
        });
        return;
      }

      // Create a new sync log entry
      const syncLog = await prisma.syncLog.create({
        data: {
          syncType: 'full',
          status: 'started',
          metadata: { triggeredBy: 'admin', triggeredAt: new Date().toISOString() },
        },
      });

      // Start sync in background (don't await)
      this.runSyncInBackground(syncLog.id);

      res.json({
        message: 'Sync started',
        syncId: syncLog.id,
        status: 'started',
      });
    } catch (error: any) {
      console.error('Error triggering sync:', error);
      res.status(500).json({ error: 'Failed to start sync', message: error.message });
    }
  }

  /**
   * Run sync in background
   */
  private async runSyncInBackground(syncLogId: string): Promise<void> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsErrors = 0;

    try {
      // Update status to running
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { status: 'running' },
      });

      // All 50 states
      const states = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      ];

      // Sync candidates for each state
      for (const state of states) {
        for (const office of ['S', 'H']) {
          try {
            const result = await candidateService.syncCandidates({
              state,
              office,
              cycle: 2026,
              maxPages: 3,
            });
            recordsProcessed += result.synced;
            recordsErrors += result.errors;

            // Update progress
            await prisma.syncLog.update({
              where: { id: syncLogId },
              data: { recordsProcessed, recordsErrors },
            });
          } catch (error: any) {
            console.error(`Error syncing ${state} ${office}:`, error.message);
            recordsErrors++;
          }
        }
      }

      // Generate elections
      try {
        const electionResult = await electionService.generateElections(2026);
        recordsProcessed += electionResult.electionsCreated + electionResult.candidateLinksCreated;
      } catch (error: any) {
        console.error('Error generating elections:', error.message);
        recordsErrors++;
      }

      // Mark as completed
      const duration = Date.now() - startTime;
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          recordsProcessed,
          recordsErrors,
          duration,
        },
      });

      console.log(`✅ Admin-triggered sync completed in ${(duration / 1000 / 60).toFixed(2)} minutes`);
    } catch (error: any) {
      // Mark as failed
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          recordsProcessed,
          recordsErrors,
          errorMessage: error.message,
          duration: Date.now() - startTime,
        },
      });

      console.error('❌ Admin-triggered sync failed:', error.message);
    }
  }

  /**
   * POST /api/admin/generate-elections
   * Trigger election generation
   */
  async triggerGenerateElections(req: Request, res: Response): Promise<void> {
    try {
      const { cycle = 2026 } = req.query;
      const cycleNum = typeof cycle === 'string' ? parseInt(cycle) : 2026;

      const result = await electionService.generateElections(cycleNum);

      res.json({
        message: 'Elections generated successfully',
        cycle: cycleNum,
        ...result,
      });
    } catch (error: any) {
      console.error('Error generating elections:', error);
      res.status(500).json({ error: 'Failed to generate elections', message: error.message });
    }
  }
}

export const adminController = new AdminController();

