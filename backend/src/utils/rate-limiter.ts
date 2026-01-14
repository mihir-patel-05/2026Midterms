import Bottleneck from 'bottleneck';
import { env } from '../config/env.js';

// Calculate requests per second from requests per hour
const requestsPerHour = env.FEC_API_MAX_REQUESTS_PER_HOUR;
const requestsPerSecond = requestsPerHour / 3600;

// Create a rate limiter for FEC API
// FEC API allows 120 requests per hour (default) - 1000/hour if enhanced
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
  const id = jobInfo.options.id;

  // Only log non-timeout errors
  if (!error.message.includes('timeout') && !error.message.includes('ECONNRESET')) {
    console.warn(`⚠️  FEC API request failed: ${error.message}`);
  }

  // Retry with exponential backoff
  if (jobInfo.retryCount < 3) {
    const delay = Math.pow(2, jobInfo.retryCount) * 1000;
    return delay;
  }
});

fecRateLimiter.on('depleted', () => {
  console.warn('⏳ FEC API rate limit depleted. Throttling requests...');
});
