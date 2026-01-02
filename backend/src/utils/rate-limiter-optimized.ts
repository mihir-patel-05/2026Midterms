import Bottleneck from 'bottleneck';
import { env } from '../config/env.js';

// Calculate requests per second from requests per hour
const requestsPerHour = env.FEC_API_MAX_REQUESTS_PER_HOUR;
const requestsPerSecond = requestsPerHour / 3600;

// Create an OPTIMIZED rate limiter for FEC API
// FEC API allows 120 requests per hour (default) = 1000 requests per hour if you have an enhanced key
// We'll use a more aggressive strategy with parallel requests
export const fecRateLimiterOptimized = new Bottleneck({
  reservoir: requestsPerHour, // Initial number of requests
  reservoirRefreshAmount: requestsPerHour,
  reservoirRefreshInterval: 60 * 60 * 1000, // Refill every hour

  // OPTIMIZATION: Allow up to 10 concurrent requests instead of 1
  maxConcurrent: 10,

  // OPTIMIZATION: Reduce minimum time between requests
  // At 2 req/sec with 10 concurrent, we can handle 20 req/sec burst capacity
  minTime: Math.floor(1000 / Math.min(requestsPerSecond, 5)), // Max 5/sec per slot
});

// Log rate limiter events (reduced logging)
fecRateLimiterOptimized.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id;

  // Only log non-network errors
  if (!error.message.includes('timeout') && !error.message.includes('ECONNRESET')) {
    console.warn(`⚠️  FEC API request failed: ${error.message}`);
  }

  // Retry with exponential backoff
  if (jobInfo.retryCount < 3) {
    const delay = Math.pow(2, jobInfo.retryCount) * 1000;
    return delay;
  }
});

fecRateLimiterOptimized.on('depleted', () => {
  console.warn('⏳ FEC API rate limit depleted. Throttling requests...');
});

fecRateLimiterOptimized.on('error', (error) => {
  console.error('❌ Rate limiter error:', error);
});
