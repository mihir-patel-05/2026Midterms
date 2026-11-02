import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { CivicApiClient } from '../features/election-results/civicapi/client.js';
import { EarlyVoteTracker, isEarlyVoteState } from '../services/early-vote/early-vote.js';

const router = Router();
const STATE_MESSAGE = 'state must be a state postal code, DC, or a territory';

export const earlyVoteStateParams = z.object({
  state: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string({ error: STATE_MESSAGE }).refine(isEarlyVoteState, STATE_MESSAGE),
  ),
});

let tracker: EarlyVoteTracker | null = null;

/** One tracker per process, made on first use so a build with early vote off never calls civicAPI. */
export function earlyVoteTracker() {
  tracker ??= new EarlyVoteTracker(
    new CivicApiClient({
      baseUrl: env.CIVICAPI_BASE_URL,
      timeoutMs: env.CIVICAPI_TIMEOUT_MS,
      maxRps: env.EARLY_VOTE_MAX_RPS,
      userAgent: `VoteInformed early-vote (+https://civicapi.org attribution${env.CIVICAPI_CONTACT ? `; ${env.CIVICAPI_CONTACT}` : ''})`,
    }),
    { refreshMs: env.EARLY_VOTE_REFRESH_SECONDS * 1000 },
  );
  return tracker;
}

function disabled(res: Response) {
  if (env.EARLY_VOTE_ENABLED) return false;
  res.status(404).json({ error: 'Early vote is turned off', code: 'DISABLED' });
  return true;
}

function unavailable(res: Response, error: unknown) {
  console.error('[early-vote] Read failed:', error instanceof Error ? error.message : error);
  res.status(503).json({ error: 'Early vote data is unavailable', code: 'UNAVAILABLE' });
}

/**
 * GET /api/early-vote
 * Ballots requested, mail ballots returned, and in-person early votes for every state civicAPI lists, by party
 * registration where the state publishes it, with national totals. Each state carries its own snapshot date
 * (null until confirmed). Party is registration, not vote choice; early ballots are not results.
 * Credit civicAPI wherever these are shown.
 */
router.get('/', async (_req, res) => {
  if (disabled(res)) return;
  try {
    const data = await earlyVoteTracker().national();
    // Short, so browsers polling every minute see a change soon after this server does.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ data });
  } catch (error) {
    unavailable(res, error);
  }
});

/**
 * GET /api/early-vote/:state
 * One state's numbers and its counties for each category civicAPI lists it under. A state civicAPI does not
 * list returns 200 with no categories, never zeros.
 */
router.get('/:state', async (req, res) => {
  if (disabled(res)) return;
  const parsed = earlyVoteStateParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid state' });
    return;
  }
  try {
    const data = await earlyVoteTracker().state(parsed.data.state);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ data });
  } catch (error) {
    unavailable(res, error);
  }
});

export default router;
