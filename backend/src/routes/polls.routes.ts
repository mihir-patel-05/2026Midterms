import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getPollsDb } from '../config/polls-database.js';
import { NationalPollsCache } from '../services/polls/national.js';
import { getRaceAverages, getRacePolls, PollsNotLoadedError, RACE_CODE } from '../services/polls/poll-read.js';
import { VoteHubClient } from '../services/polls/votehub-client.js';

const router = Router();

const RACE_MESSAGE = 'race must be a race code such as PA-SEN, PA-07, or AK-00';
const RACES_MESSAGE = 'races must be 1 to 60 comma-separated race codes such as PA-SEN,PA-07';
const LIMIT_MESSAGE = 'limit must be a whole number from 1 to 100';
const MAX_RACES = 60;

const raceCode = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string({ required_error: RACE_MESSAGE, invalid_type_error: RACE_MESSAGE }).regex(RACE_CODE, RACE_MESSAGE),
);

export const pollsQuery = z.object({
  race: raceCode,
  limit: z.coerce.number({ invalid_type_error: LIMIT_MESSAGE }).int(LIMIT_MESSAGE).min(1, LIMIT_MESSAGE).max(100, LIMIT_MESSAGE).default(25),
});

export const averagesQuery = z.object({
  races: z.preprocess(
    (value) => (typeof value === 'string' ? [...new Set(value.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean))] : value),
    z.array(z.string().regex(RACE_CODE, RACES_MESSAGE), { required_error: RACES_MESSAGE, invalid_type_error: RACES_MESSAGE })
      .min(1, RACES_MESSAGE).max(MAX_RACES, RACES_MESSAGE),
  ),
});

/** The polls database, or an answer saying why there is none. */
function pollsDbOr404(res: Response) {
  if (!env.POLLS_ENABLED) {
    res.status(404).json({ error: 'Polls are turned off', code: 'DISABLED' });
    return null;
  }
  const db = getPollsDb();
  if (!db) res.status(503).json({ error: 'Polls are not connected yet', code: 'NOT_CONFIGURED' });
  return db;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof PollsNotLoadedError) {
    res.status(404).json({ error: error.message, code: 'NOT_LOADED' });
    return;
  }
  // Driver errors can name hosts and credentials; keep them in the logs.
  console.error('Polls lookup failed:', error instanceof Error ? error.message : error);
  res.status(503).json({ error: 'Polls are unavailable', code: 'UNAVAILABLE' });
}

let national: NationalPollsCache | null = null;

/**
 * GET /api/polls/national
 * Presidential approval and the generic congressional ballot: each series' average
 * (`status` is average, too_few, stale, or none), its newest polls, and attribution.
 * Read from VoteHub at most every 3 hours; needs no polls database.
 */
router.get('/national', async (_req, res) => {
  if (!env.NATIONAL_POLLS_ENABLED) {
    res.status(404).json({ error: 'National polls are turned off', code: 'DISABLED' });
    return;
  }
  try {
    national ??= new NationalPollsCache(new VoteHubClient({ baseUrl: env.VOTEHUB_API_BASE_URL, retries: 1 }));
    const data = await national.get();
    res.set('Cache-Control', 'public, max-age=900');
    res.json({ data });
  } catch (error) {
    console.error('National polls lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'National polls are unavailable', code: 'UNAVAILABLE' });
  }
});

/**
 * GET /api/polls?race=PA-SEN&limit=25
 * A race's published polls, newest first, and its polling average
 * (`average.status` is average, too_few, stale, or none). Polls via VoteHub,
 * CC BY 4.0: show `source.attribution` wherever they appear.
 */
router.get('/', async (req, res) => {
  const parsed = pollsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  const db = pollsDbOr404(res);
  if (!db) return;
  try {
    const data = await getRacePolls(db, parsed.data.race, { limit: parsed.data.limit });
    // Syncs run every 3 hours; 5 minutes lets an admin's review show soon after.
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

/**
 * GET /api/polls/averages?races=PA-SEN,PA-07
 * The polling average for each race, without the poll lists.
 */
router.get('/averages', async (req, res) => {
  const parsed = averagesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  const db = pollsDbOr404(res);
  if (!db) return;
  try {
    const data = await getRaceAverages(db, parsed.data.races);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
