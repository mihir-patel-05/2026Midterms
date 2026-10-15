import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { getIndicators, IndicatorsNotLoadedError } from '../services/fred/indicator-read.js';

const router = Router();

const DAYS_MESSAGE = 'days must be a whole number from 30 to 1825';

export const indicatorsQuery = z.object({
  days: z.coerce.number({ invalid_type_error: DAYS_MESSAGE }).int(DAYS_MESSAGE).min(30, DAYS_MESSAGE).max(1825, DAYS_MESSAGE).default(730),
});

/**
 * GET /api/indicators?days=730
 * FRED economic indicators for the monitor's economy strip: each series' latest
 * value, change, staleness, source, and history. Context only, never a forecast.
 */
router.get('/', async (req, res) => {
  if (!env.ECON_INDICATORS_ENABLED) {
    res.status(404).json({ error: 'Economic indicators are turned off' });
    return;
  }
  const parsed = indicatorsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
    return;
  }

  try {
    const data = await getIndicators(prisma, { days: parsed.data.days, includeRestricted: env.FRED_RESTRICTED_SERIES_ENABLED });
    // Syncs run twice a day; 15 minutes keeps a fresh run visible soon after it lands.
    res.set('Cache-Control', 'public, max-age=900');
    res.json({ data });
  } catch (error) {
    if (error instanceof IndicatorsNotLoadedError) {
      res.status(404).json({ error: error.message, code: 'NOT_LOADED' });
      return;
    }
    console.error('Indicators lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Economic indicators are unavailable' });
  }
});

export default router;
