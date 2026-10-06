import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { DistrictLookupError, districtLookupService } from '../services/district-lookup.service.js';

const router = Router();

// Each lookup is billed by Geocodio, so this is far stricter than the public API limit.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many address lookups, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const lookupQuery = z.object({ address: z.string().trim().min(3).max(200) });

/**
 * GET /api/districts/lookup?address=500 Congress Ave, Austin, TX
 * The 2026 congressional district(s) for an address or ZIP. A ZIP or partial
 * address can span districts; each comes with its share of the matched area.
 */
router.get('/lookup', lookupLimiter, async (req, res) => {
  const parsed = lookupQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide an address or ZIP code (3-200 characters)' });
    return;
  }

  try {
    res.json(await districtLookupService.lookupAddress(parsed.data.address));
  } catch (error) {
    if (error instanceof DistrictLookupError) {
      res.status(error.kind === 'unresolvable' ? 400 : 503).json({ error: error.message });
      return;
    }
    console.error('District lookup failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'District lookup is unavailable' });
  }
});

export default router;
