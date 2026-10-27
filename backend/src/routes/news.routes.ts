import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { getTopStories, type TopStoriesData } from '../services/news/news-read.js';

const router = Router();

const LIMIT_MESSAGE = 'limit must be a whole number from 1 to 20';
export const topStoriesQuery = z.object({
  limit: z.coerce.number({ invalid_type_error: LIMIT_MESSAGE }).int(LIMIT_MESSAGE).min(1, LIMIT_MESSAGE).max(20, LIMIT_MESSAGE).default(10),
});

// Ranking reads up to two days of articles; one answer per limit serves every visitor for a minute.
const CACHE_MS = 60_000;
const cache = new Map<number, { at: number; data: TopStoriesData }>();

/**
 * GET /api/news/top?limit=10
 * National election stories from Google News. Ranked by a published trending score
 * (outlets covering the story, Google's placement, recency), then, when the top
 * stories agent is on, re-ranked by Claude for likely midterm impact ("top" mode,
 * reason codes and race keys only). Each item links to its publisher.
 * See docs/plans/news-agents.md.
 */
router.get('/top', async (req, res) => {
  if (!env.NEWS_INGEST_ENABLED) {
    res.status(404).json({ error: 'News is turned off' });
    return;
  }
  const parsed = topStoriesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }
  try {
    const { limit } = parsed.data;
    const cached = cache.get(limit);
    const data = cached && Date.now() - cached.at < CACHE_MS ? cached.data : await getTopStories(prisma, { limit, agentsEnabled: env.NEWS_AGENTS_ENABLED });
    if (!cached || cached.data !== data) cache.set(limit, { at: Date.now(), data });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data });
  } catch (error) {
    console.error('Top stories lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Top stories are unavailable' });
  }
});

export default router;
