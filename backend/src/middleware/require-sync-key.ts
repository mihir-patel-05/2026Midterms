import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Constant-time string comparison to avoid leaking the key via timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so guard first. The early return
  // leaks length only, which is not sensitive for a random key.
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Gate the machine-facing /api/sync/* endpoints behind a shared secret.
 *
 * Fails closed: if SYNC_API_KEY is not configured the sync API is disabled
 * entirely (503), so an unconfigured deployment can never expose unauthenticated
 * data-sync / FEC-quota-burning endpoints. When configured, callers must send a
 * matching `x-sync-key` header.
 */
export function requireSyncKey(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = env.SYNC_API_KEY;

  if (!expectedKey) {
    console.warn('⚠️  Rejected /api/sync request: SYNC_API_KEY is not configured (sync API disabled)');
    res.status(503).json({
      error: 'Sync API disabled',
      message: 'SYNC_API_KEY is not configured on the server.',
    });
    return;
  }

  const header = req.headers['x-sync-key'];
  const providedKey = Array.isArray(header) ? header[0] : header;

  if (!providedKey || !safeEqual(providedKey, expectedKey)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing x-sync-key header.',
    });
    return;
  }

  next();
}
