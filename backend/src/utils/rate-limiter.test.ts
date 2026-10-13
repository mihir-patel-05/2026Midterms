import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertFecNotRateLimited, FecRateLimitedError, tripFecRateLimit } from './rate-limiter.js';

test('a 429 pauses FEC requests until the cooldown ends', () => {
  assert.doesNotThrow(assertFecNotRateLimited);

  const error = tripFecRateLimit('120');
  assert.ok(error instanceof FecRateLimitedError);
  const pausedFor = error.retryAt.getTime() - Date.now();
  assert.ok(pausedFor > 110_000 && pausedFor <= 120_000);
  assert.throws(assertFecNotRateLimited, FecRateLimitedError);

  // Without Retry-After the default cooldown applies and never shortens an open circuit.
  assert.ok(tripFecRateLimit(undefined).retryAt.getTime() - Date.now() > 59 * 60 * 1000);
});
