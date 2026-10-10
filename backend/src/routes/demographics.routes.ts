import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import {
  DemographicsNotLoadedError,
  getDemographics,
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
  .refine((query) => query.counties.length > 0 || query.districts.length > 0, { message: 'Select at least one county or district' })
  .refine((query) => stateFipsFor(query.state) !== null, { message: 'Unknown state' })
  .refine((query) => query.counties.every((fips) => fips.startsWith(stateFipsFor(query.state) ?? '--')), {
    message: 'Counties must be in the selected state',
  });

/**
 * GET /api/demographics?state=TX&counties=48201,48157&districts=07,09
 * ACS 5-year demographics for the selection. With both counties and districts,
 * the figures cover only the parts of those counties inside those districts.
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
