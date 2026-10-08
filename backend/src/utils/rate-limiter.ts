import Bottleneck from 'bottleneck';
import { env } from '../config/env.js';

// Calculate requests per second from requests per hour
const requestsPerHour = env.FEC_API_MAX_REQUESTS_PER_HOUR;
const requestsPerSecond = requestsPerHour / 3600;

/** Cooldown when OpenFEC returns 429 without a usable Retry-After header. */
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;

let rateLimitedUntil = 0;

/**
 * Thrown instead of calling OpenFEC while the rate-limit circuit is open, so
 * queued and new requests fail fast rather than burning more of the quota.
 */
export class FecRateLimitedError extends Error {
  constructor(readonly retryAt: Date) {
    super(`OpenFEC rate limit reached; FEC requests paused until ${retryAt.toISOString()}`);
    this.name = 'FecRateLimitedError';
  }
}

/** Throw if a previous 429 opened the circuit and its cooldown hasn't passed. */
export function assertFecNotRateLimited(): void {
  if (Date.now() < rateLimitedUntil) throw new FecRateLimitedError(new Date(rateLimitedUntil));
}

/** Open the circuit after a 429, honouring Retry-After when OpenFEC sends it. */
export function tripFecRateLimit(retryAfterHeader?: string): FecRateLimitedError {
  const retryAfterMs = Number(retryAfterHeader) * 1000;
  const cooldown = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : RATE_LIMIT_COOLDOWN_MS;
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + cooldown);
  const error = new FecRateLimitedError(new Date(rateLimitedUntil));
  console.error(`🛑 ${error.message}`);
  return error;
}

// Create a rate limiter for FEC API
// A standard registered FEC API key allows 1,000 requests per hour. Keep this
// configurable for environments using a lower or specially approved limit.
// OPTIMIZED: Allow parallel requests for much faster syncing
export const fecRateLimiter = new Bottleneck({
  reservoir: requestsPerHour, // Initial number of requests
  reservoirRefreshAmount: requestsPerHour,
  reservoirRefreshInterval: 60 * 60 * 1000, // Refill every hour
  maxConcurrent: 10, // OPTIMIZED: Process 10 requests in parallel (was 1)
  minTime: Math.floor(1000 / Math.min(requestsPerSecond, 5)), // OPTIMIZED: Max 5/sec per slot (was 2)
});

// Log rate limiter events (OPTIMIZED: reduced logging)
fecRateLimiter.on('failed', async (error, jobInfo) => {
  // Hitting the quota is final until the cooldown ends; retrying only makes it worse.
  if (error instanceof FecRateLimitedError) return;

  // Only log non-timeout errors
  if (!error.message.includes('timeout') && !error.message.includes('ECONNRESET')) {
    console.warn(`⚠️  FEC API request failed: ${error.message}`);
  }

  // Client errors (bad key, bad params, not found) fail the same way on retry.
  // Only server errors and network failures are retried.
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status !== undefined && status < 500) return;

  // Retry with exponential backoff
  if (jobInfo.retryCount < 3) {
    const delay = Math.pow(2, jobInfo.retryCount) * 1000;
    return delay;
  }
});

fecRateLimiter.on('depleted', () => {
  console.warn('⏳ FEC API rate limit depleted. Throttling requests...');
});
