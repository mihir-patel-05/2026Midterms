/**
 * Paths under /api that the public rate limit leaves out. Each is served from an in-memory cache that answers every
 * caller with one upstream read, so a crowd on election night costs no more than one visitor:
 * - `/v1/...`: election results, cached 10 s per URL with concurrent misses coalesced.
 * - `/prediction-markets/kalshi/stream`: the live price stream, one long-lived connection per tab. A tab reconnecting
 *   after a redeploy should not spend its allowance.
 * - `/live-streams`: the network video list, read every 2 minutes.
 * Admin routes have their own limiter.
 */
const EXEMPT = [/^\/v1(\/|$)/, /^\/prediction-markets\/kalshi\/stream$/, /^\/live-streams(\/|$)/, /^\/admin(\/|$)/];

/** `path` is relative to the /api mount, as express-rate-limit sees `req.path`. */
export function skipPublicRateLimit(path: string): boolean {
  return EXEMPT.some((pattern) => pattern.test(path));
}
