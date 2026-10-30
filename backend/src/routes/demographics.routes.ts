import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import {
  DemographicsNotLoadedError,
  getDemographics,
  getDemographicsMap,
  mapMetric,
  MAX_SELECTED_COUNTIES,
  MAX_SELECTED_DISTRICTS,
  stateFipsFor,
} from '../services/demographics.service.js';

const router = Router();

const list = (pattern: RegExp, max: number) => z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []))
  .pipe(z.array(z.string().regex(pattern)).max(max));

export const demographicsQuery = z
  .object({
    state: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
    counties: list(/^\d{5}$/, MAX_SELECTED_COUNTIES),
    districts: list(/^\d{2}$/, MAX_SELECTED_DISTRICTS),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
  })
  .refine((query) => stateFipsFor(query.state) !== null, { message: 'Unknown state' })
  .refine((query) => query.counties.every((fips) => fips.startsWith(stateFipsFor(query.state) ?? '--')), {
    message: 'Counties must be in the selected state',
  });

export const demographicsMapQuery = z
  .object({
    level: z.enum(['state', 'county', 'district']),
    metric: z.string().refine((key) => mapMetric(key) !== null, { message: 'Unknown metric' }),
    state: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).optional(),
    year: z.coerce.number().int().min(2020).max(2100).optional(),
  })
  .refine((query) => !query.state || stateFipsFor(query.state) !== null, { message: 'Unknown state' });

/**
 * GET /api/demographics/map?level=county&metric=race_hispanic&state=TX
 * One ACS metric for every state, county, or House district (optionally in one
 * state), for colouring the map. Counties nationwide are about 3,200 values.
 */
router.get('/map', async (req, res) => {
  const parsed = demographicsMapQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { level, metric, state = null, year = env.CENSUS_ACS_YEAR } = parsed.data;

  try {
    const data = await getDemographicsMap(prisma, { level, metric, state, year });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data });
  } catch (error) {
    if (error instanceof DemographicsNotLoadedError) {
      res.status(404).json({ error: error.message, code: 'NOT_LOADED' });
      return;
    }
    console.error('Demographics map lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Demographics are unavailable' });
  }
});

/**
 * GET /api/demographics?state=TX&counties=48201,48157&districts=07,09
 * ACS 5-year demographics for the selection. With neither counties nor districts,
 * the figures cover the whole state. With both, they cover only the parts of
 * those counties inside those districts.
 */
router.get('/', async (req, res) => {
  const parsed = demographicsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid selection' });
    return;
  }
  const { state, counties, districts, year = env.CENSUS_ACS_YEAR } = parsed.data;

  try {
    const data = await getDemographics(prisma, { state, counties, districts, year });
    // ACS figures change once a year; a short browser cache keeps map clicking snappy.
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ data });
  } catch (error) {
    if (error instanceof DemographicsNotLoadedError) {
      res.status(404).json({ error: error.message, code: 'NOT_LOADED' });
      return;
    }
    console.error('Demographics lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Demographics are unavailable' });
  }
});

export default router;
