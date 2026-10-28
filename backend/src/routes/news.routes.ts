import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { getTopStories } from '../services/news/news-read.js';

const router = Router();

const TOPICS = ['CAMPAIGN', 'POLLS', 'CONGRESS', 'WHITE_HOUSE', 'COURTS', 'MONEY', 'VOTING', 'RESULTS', 'POLICY', 'OTHER'] as const;
const TOPIC_MESSAGE = `topic must be one of ${TOPICS.join(', ')}`;

export const topStoriesQuery = z.object({
  topic: z.preprocess(
    (value) => (typeof value === 'string' ? value.toUpperCase() : value),
    z.enum(TOPICS, { errorMap: () => ({ message: TOPIC_MESSAGE }) }),
  ).optional(),
});

/**
 * GET /api/news/top?topic=COURTS
 * The most important U.S. political stories of the past 24 hours, most
 * important first: the publisher's headline and link, the outlet, how many
 * outlets ran the story, and a few of them. Picked by Agent 10, or ranked by
 * coverage when the agent is off (`method`).
 */
router.get('/top', async (req, res) => {
  if (!env.NEWS_ENABLED) {
    res.status(404).json({ error: 'News is turned off' });
    return;
  }
  const parsed = topStoriesQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }

  try {
    const data = await getTopStories(prisma, { topic: parsed.data.topic });
    // The list changes every 2 hours at most; 5 minutes keeps a new run visible soon after it lands.
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data });
  } catch (error) {
    console.error('Top stories lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Top stories are unavailable' });
  }
});

export default router;
