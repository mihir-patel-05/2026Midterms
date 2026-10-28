import { Router, type Response } from 'express';
import { z } from 'zod';
import { verifyAdminAuth } from '../controllers/admin.controller.js';
import { env } from '../config/env.js';
import { getPollsDb } from '../config/polls-database.js';
import { acceptPoll, listReviewQueue, PollNotFoundError, PollReviewError, pollsStatus, rejectPoll } from '../services/polls/poll-review.js';

const router = Router();
router.use(verifyAdminAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reviewQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  reason: z.enum(['no_race_match', 'ambiguous_race', 'likely_primary']).optional(),
});

export const acceptBody = z.object({
  raceCode: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z]{2}-(SEN|\d{2})$/, 'raceCode must be a race code such as PA-SEN, PA-07, or AK-00'),
  ).optional(),
}).strict();

function pollsDb(res: Response) {
  const db = env.POLLS_ENABLED ? getPollsDb() : null;
  if (!db) res.status(503).json({ error: 'Polls are not configured: set POLLS_DATABASE_URL', code: 'NOT_CONFIGURED' });
  return db;
}

function fail(res: Response, error: unknown) {
  if (error instanceof PollNotFoundError) res.status(404).json({ error: error.message });
  else if (error instanceof PollReviewError) res.status(400).json({ error: error.message });
  else {
    console.error('Poll review failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Polls are unavailable' });
  }
}

const reviewer = (res: Response) => String(res.locals.adminUsername ?? 'admin');

/** GET /api/admin/polls/status: the last 10 sync runs and poll counts by status. */
router.get('/status', async (_req, res) => {
  const db = pollsDb(res);
  if (!db) return;
  try {
    res.json({ data: await pollsStatus(db) });
  } catch (error) {
    fail(res, error);
  }
});

/** GET /api/admin/polls/review?limit=50&reason=likely_primary: polls waiting for an admin. */
router.get('/review', async (req, res) => {
  const parsed = reviewQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  const db = pollsDb(res);
  if (!db) return;
  try {
    res.json({ data: await listReviewQueue(db, parsed.data) });
  } catch (error) {
    fail(res, error);
  }
});

/** POST /api/admin/polls/:id/accept { raceCode? }: publish a poll, under a corrected race if given. */
router.post('/:id/accept', async (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(404).json({ error: 'Poll not found' });
    return;
  }
  const parsed = acceptBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  const db = pollsDb(res);
  if (!db) return;
  try {
    res.json({ data: await acceptPoll(db, req.params.id, { raceCode: parsed.data.raceCode, reviewer: reviewer(res) }) });
  } catch (error) {
    fail(res, error);
  }
});

/** POST /api/admin/polls/:id/reject: hide a poll for good. */
router.post('/:id/reject', async (req, res) => {
  if (!UUID.test(req.params.id)) {
    res.status(404).json({ error: 'Poll not found' });
    return;
  }
  const db = pollsDb(res);
  if (!db) return;
  try {
    res.json({ data: await rejectPoll(db, req.params.id, { reviewer: reviewer(res) }) });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
