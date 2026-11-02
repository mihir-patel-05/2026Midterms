import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skipPublicRateLimit } from './public-rate-limit.js';

describe('skipPublicRateLimit', () => {
  it('leaves cached election-night reads and admin routes out', () => {
    for (const path of ['/v1/bootstrap', '/v1/contests/abc/results/current', '/v1/sources/status', '/prediction-markets/kalshi/stream', '/live-streams', '/admin', '/admin/live-streams']) {
      assert.equal(skipPublicRateLimit(path), true, path);
    }
  });

  it('still counts everything else', () => {
    for (const path of ['/prediction-markets', '/prediction-markets/history', '/elections/states/counts', '/early-vote', '/v1x', '/administrator', '/chat']) {
      assert.equal(skipPublicRateLimit(path), false, path);
    }
  });
});
