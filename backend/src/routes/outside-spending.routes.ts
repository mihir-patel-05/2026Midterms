import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { houseDistrict } from '../services/election.service.js';
import { getCandidateOutsideSpending, getRaceOutsideSpending } from '../services/outside-spending/outside-spending.service.js';

const router = Router();

const cycleParam = z.coerce.number().int().min(2000).max(2100).refine((cycle) => cycle % 2 === 0, 'Cycle must be an even year').default(2026);

export const raceQuery = z
  .object({
    state: z.string().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
    office: z.enum(['H', 'S', 'h', 's']).transform((value) => value.toUpperCase() as 'H' | 'S'),
    district: z.string().regex(/^\d{1,2}$/).optional(),
    cycle: cycleParam,
  })
  .transform((query, ctx) => {
    if (query.office === 'S') return { ...query, district: null };
    const district = houseDistrict(query.state, query.district ?? '00');
    if (!district) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown House district for this state' });
      return z.NEVER;
    }
    return { ...query, district };
  });

// Outside spending changes at most daily; a short cache keeps the map responsive.
const cached = (res: Response) => res.set('Cache-Control', 'public, max-age=300');

/**
 * GET /api/outside-spending/race?state=PA&office=H&district=07&cycle=2026
 * Independent expenditures for and against each candidate in one race.
 */
router.get('/race', async (req: Request, res: Response) => {
  const parsed = raceQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid race' });
    return;
  }
  try {
    cached(res).json({ data: await getRaceOutsideSpending(prisma, parsed.data) });
  } catch (error) {
    console.error('Race outside spending failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Outside spending is unavailable' });
  }
});

/**
 * GET /api/candidates/:id/outside-spending?cycle=2026
 * :id is the VoteInformed candidate ID or the FEC candidate ID.
 */
export async function candidateOutsideSpendingHandler(req: Request, res: Response) {
  const cycle = cycleParam.safeParse(req.query.cycle);
  if (!cycle.success) {
    res.status(400).json({ error: 'Invalid cycle' });
    return;
  }
  try {
    const id = req.params.id;
    const candidate = await prisma.candidate.findFirst({ where: { OR: [{ id }, { candidateId: id.toUpperCase() }] }, select: { candidateId: true } });
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    cached(res).json({ data: await getCandidateOutsideSpending(prisma, candidate.candidateId, cycle.data) });
  } catch (error) {
    console.error('Candidate outside spending failed:', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Outside spending is unavailable' });
  }
}

export default router;
