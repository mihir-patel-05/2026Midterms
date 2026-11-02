import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { costOfLiving, FuelNotLoadedError, type CostOfLivingResponse } from '../services/fuel/fuel-read.js';
import { STATE_REGION } from '../services/fuel/fuel-catalog.js';
import { tariffExposure, type ExposureResponse } from '../services/tariff/exposure.js';

const router = Router();
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; body: CostOfLivingResponse }>();

export const costOfLivingQuery = z.object({
  state: z.preprocess(
    (value) => (typeof value === 'string' && value ? value.toUpperCase() : undefined),
    z.string().refine((code) => code in STATE_REGION, 'state must be a state postal code or DC').optional(),
  ),
});

/**
 * GET /api/cost-of-living?state=MI
 * The state's weekly gasoline and diesel prices (its own EIA series, or its region's, labelled),
 * the gap to the U.S., fixed-window changes, and two years of history. Facts about a place,
 * never a prediction or explanation of how it votes.
 */
router.get('/', async (req, res) => {
  if (!env.COST_OF_LIVING_ENABLED) return res.status(404).json({ error: 'Cost of living is turned off' });
  const parsed = costOfLivingQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
  const state = parsed.data.state ?? null;
  const key = state ?? 'US';
  try {
    const hit = cache.get(key);
    const body = hit && Date.now() - hit.at < CACHE_MS ? hit.body : await costOfLiving(prisma, state);
    if (!hit || hit.body !== body) cache.set(key, { at: Date.now(), body });
    res.set('Cache-Control', 'public, max-age=900');
    return res.json(body);
  } catch (error) {
    if (error instanceof FuelNotLoadedError) return res.status(503).json({ error: error.message, code: 'NOT_LOADED' });
    console.error('[cost-of-living] Read failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Cost of living data is unavailable' });
  }
});

let exposureCache: { at: number; body: ExposureResponse } | null = null;

/**
 * GET /api/cost-of-living/tariff-exposure
 * The tariff exposure score for the 50 states and DC, with each of its four measures, their
 * percentiles and periods, and the method. Exposure, not a measured cost. Cached one hour.
 */
router.get('/tariff-exposure', async (_req, res) => {
  if (!env.COST_OF_LIVING_ENABLED) return res.status(404).json({ error: 'Cost of living is turned off' });
  try {
    if (!exposureCache || Date.now() - exposureCache.at > 60 * 60 * 1000) exposureCache = { at: Date.now(), body: await tariffExposure(prisma) };
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(exposureCache.body);
  } catch (error) {
    console.error('[tariff-exposure] Read failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Tariff exposure is unavailable' });
  }
});

export default router;
