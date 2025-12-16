import Bottleneck from 'bottleneck';
import { env } from '../config/env.js';

// Calculate requests per second from requests per hour
const requestsPerHour = env.FEC_API_MAX_REQUESTS_PER_HOUR;
const requestsPerSecond = requestsPerHour / 3600;

// Create a rate limiter for FEC API
// FEC API allows 120 requests per hour (default)
// We'll be conservative: 2 requests per second max
export const fecRateLimiter = new Bottleneck({
  reservoir: requestsPerHour, // Initial number of requests
  reservoirRefreshAmount: requestsPerHour,
  reservoirRefreshInterval: 60 * 60 * 1000, // Refill every hour
  maxConcurrent: 1, // Process one request at a time
  minTime: Math.floor(1000 / Math.min(requestsPerSecond, 2)), // Minimum time between requests (max 2/sec)
});

// Log rate limiter events
fecRateLimiter.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id;
  console.warn(`⚠️  FEC API request ${id} failed: ${error.message}`);

  // Retry with exponential backoff
  if (jobInfo.retryCount < 3) {
    const delay = Math.pow(2, jobInfo.retryCount) * 1000;
    console.log(`🔄 Retrying ${id} in ${delay}ms...`);
    return delay;
  }
});

fecRateLimiter.on('retry', (error, jobInfo) => {
  console.log(`🔄 Retrying FEC API request ${jobInfo.options.id}`);
});

fecRateLimiter.on('depleted', () => {
  console.warn('⏳ FEC API rate limit depleted. Requests will be queued.');
});
