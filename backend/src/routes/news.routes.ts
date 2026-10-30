import { Router, type Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { stateNames } from '../services/kalshi/shared.js';
import { NEWS_SOURCE, raceQuery, searchNews, topQuery, type NewsResponse } from '../services/news/latest-coverage.js';

const router = Router();

const NAME = /^[\p{L}][\p{L} .'’-]{1,59}$/u;

export const raceNewsQuery = z.object({
  names: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []))
    .pipe(z.array(z.string().regex(NAME, 'names must be plain names')).max(4)),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const topNewsQuery = z.object({
  state: z.string().transform((value) => value.toUpperCase()).refine((value) => Object.hasOwn(stateNames, value), 'Unknown state').optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

async function respond(res: Response, scope: NewsResponse['scope'], limit: number) {
  try {
    const { items, fetchedAt } = await searchNews(env.NEWS_RSS_BASE_URL, scope.query, limit);
    const body: NewsResponse = {
      mode: items.length ? 'latest' : 'none',
      ...(items.length ? {} : { reason: 'No recent coverage found.' }),
      scope,
      updatedAt: new Date(fetchedAt).toISOString(),
      items,
      source: NEWS_SOURCE,
    };
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data: body });
  } catch (error) {
    console.error('News search failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'News is unavailable right now' });
  }
}

/**
 * GET /api/news/races/PA-SEN?names=John%20Fetterman,Dave%20McCormick&limit=8
 * Latest coverage of one race, newest first. `names` are the candidates the
 * client shows for the race, to find its own coverage.
 */
router.get('/races/:raceKey', async (req, res) => {
  if (!env.NEWS_RSS_ENABLED) {
    res.status(404).json({ error: 'News is turned off', code: 'DISABLED' });
    return;
  }
  const parsed = raceNewsQuery.safeParse(req.query);
  const race = raceQuery(String(req.params.raceKey).toUpperCase(), parsed.success ? parsed.data.names : []);
  if (!parsed.success || !race) {
    res.status(400).json({ error: parsed.success ? 'Unknown race' : parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  await respond(res, { key: String(req.params.raceKey).toUpperCase(), ...race }, parsed.data.limit);
});

/** GET /api/news/top?state=PA — election headlines for one state, or nationally without `state`. */
router.get('/top', async (req, res) => {
  if (!env.NEWS_RSS_ENABLED) {
    res.status(404).json({ error: 'News is turned off', code: 'DISABLED' });
    return;
  }
  const parsed = topNewsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  await respond(res, topQuery(parsed.data.state ?? null), parsed.data.limit);
});

export default router;
