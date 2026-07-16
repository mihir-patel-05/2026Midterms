import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Protect operational sync routes with a dedicated service credential.
 * Missing configuration fails closed so a deployment can never accidentally
 * expose write-heavy FEC synchronization endpoints to the public internet.
 */
export function verifySyncAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.SYNC_API_KEY;
  if (!expectedKey) {
    res.status(503).json({
      error: 'Sync API is not configured',
      message: 'Set SYNC_API_KEY before using synchronization endpoints.',
    });
    return;
  }

  const providedKey = req.header('x-sync-key');
  if (!providedKey || !safeEqual(providedKey, expectedKey)) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid sync key' });
    return;
  }

  next();
}
