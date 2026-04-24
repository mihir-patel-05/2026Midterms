import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { researcherAuth } from '../controllers/researcher-auth.controller.js';
import { countyService } from '../services/county.service.js';
import { simulationService } from '../services/simulation.service.js';

const router = Router();

router.use(researcherAuth);

/**
 * GET /api/research/races
 * Params: state?, cycle?, officeType?
 * Lists distinct races that have county-level results available, with a baseline rollup.
 */
router.get('/races', async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : undefined;
    const officeType = typeof req.query.officeType === 'string' ? req.query.officeType.toUpperCase() : undefined;
    const cycle = req.query.cycle ? parseInt(String(req.query.cycle), 10) : undefined;

    const rows = await prisma.countyResult.groupBy({
      by: ['state', 'officeType', 'district', 'cycle'],
      where: {
        ...(state ? { state } : {}),
        ...(officeType ? { officeType } : {}),
        ...(cycle ? { cycle } : {}),
      },
      _sum: { votes: true },
      orderBy: [{ state: 'asc' }, { officeType: 'asc' }, { district: 'asc' }, { cycle: 'desc' }],
    });

    res.json({
      races: rows.map(r => ({
        state: r.state,
        officeType: r.officeType,
        district: r.district || null,
        cycle: r.cycle,
        totalVotes: r._sum.votes ?? 0,
        key: `${r.state}-${r.officeType}-${r.district || 'AT_LARGE'}-${r.cycle}`,
      })),
    });
  } catch (err: any) {
    console.error('[research] /races error', err);
    res.status(500).json({ error: 'Failed to list races', message: err.message });
  }
});

/**
 * GET /api/research/races/:state/:officeType/:district/:cycle
 * Detailed county breakdown for a specific race.
 * Use district = "AT_LARGE" for Senate / single-district states.
 */
router.get('/races/:state/:officeType/:district/:cycle', async (req, res) => {
  try {
    const { state, officeType } = req.params;
    const cycle = parseInt(req.params.cycle, 10);
    const district = req.params.district === 'AT_LARGE' ? '' : req.params.district;

    const counties = await countyService.getRaceBreakdown({
      state: state.toUpperCase(),
      officeType: officeType.toUpperCase() as 'HOUSE' | 'SENATE',
      district,
      cycle,
    });

    const totals = counties.reduce(
      (acc, c) => {
        acc.totalVotes += c.totalVotes;
        const dem = c.results.find(r => r.party === 'DEMOCRAT');
        const rep = c.results.find(r => r.party === 'REPUBLICAN');
        acc.demVotes += dem?.votes ?? 0;
        acc.repVotes += rep?.votes ?? 0;
        return acc;
      },
      { totalVotes: 0, demVotes: 0, repVotes: 0 },
    );

    res.json({
      race: { state: state.toUpperCase(), officeType: officeType.toUpperCase(), district: district || null, cycle },
      counties,
      rollup: {
        totalVotes: totals.totalVotes,
        demPct: totals.totalVotes ? (totals.demVotes / totals.totalVotes) * 100 : 0,
        repPct: totals.totalVotes ? (totals.repVotes / totals.totalVotes) * 100 : 0,
      },
    });
  } catch (err: any) {
    console.error('[research] /races/:key error', err);
    res.status(500).json({ error: 'Failed to fetch race detail', message: err.message });
  }
});

/**
 * GET /api/research/counties/:fips/history
 */
router.get('/counties/:fips/history', async (req, res) => {
  try {
    const officeType = typeof req.query.officeType === 'string' ? req.query.officeType.toUpperCase() : undefined;
    const cycle = req.query.cycle ? parseInt(String(req.query.cycle), 10) : undefined;
    const rows = await countyService.getCountyHistory(req.params.fips, officeType, cycle);
    res.json({ fips: req.params.fips, results: rows });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch county history', message: err.message });
  }
});

const swingSchema = z.object({ D: z.number(), R: z.number() });
const simulateSchema = z.object({
  baselineCycle: z.number().int(),
  state: z.string().length(2).optional(),
  officeType: z.enum(['HOUSE', 'SENATE']).optional(),
  swings: z.object({
    statewide: swingSchema.optional(),
    perRace: z.record(swingSchema).optional(),
  }),
});

/**
 * POST /api/research/simulate
 */
router.post('/simulate', async (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid simulation request', issues: parsed.error.issues });
    return;
  }
  try {
    const result = await simulationService.simulate(parsed.data);
    res.json(result);
  } catch (err: any) {
    console.error('[research] /simulate error', err);
    res.status(500).json({ error: 'Simulation failed', message: err.message });
  }
});

export default router;
