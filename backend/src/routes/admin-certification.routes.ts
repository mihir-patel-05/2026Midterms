import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { verifyAdminAuth } from '../controllers/admin.controller.js';
import {
  CertificationInputError, certificationOverview, recordEvent, RECORDABLE_EVENTS, removeLatestEvent, setDeadline, setRankedChoiceRound, stateTotals,
} from '../features/election-results/certification.js';
import { clearResultsCache } from './results-v1.routes.js';
import { settlementDisagreements } from '../services/kalshi/settlements.js';

/**
 * /api/admin/certification (#136): each state's certification, recounts, deadline and ranked-choice final round,
 * entered from the state's own pages with their links.
 */
export const adminCertificationRouter = Router();
adminCertificationRouter.use(verifyAdminAuth);

const eventBody = z.object({
  type: z.enum(Object.keys(RECORDABLE_EVENTS) as [keyof typeof RECORDABLE_EVENTS, ...Array<keyof typeof RECORDABLE_EVENTS>]),
  effectiveAt: z.string().min(1).max(40),
  sourceUrl: z.string().min(1).max(1000),
  notes: z.string().max(1000).nullable().optional(),
  race: z.string().max(10).nullable().optional(),
}).strict();
const deadlineBody = z.object({ deadline: z.string().max(10), sourceUrl: z.string().min(1).max(1000), notes: z.string().max(1000).nullable().optional() }).strict();
const removeBody = z.object({ race: z.string().max(10).nullable().optional() }).strict();
const roundBody = z.object({
  round: z.number().int(),
  sourceUrl: z.string().min(1).max(1000),
  results: z.array(z.object({ candidacyId: z.string().min(1).max(100), votes: z.number().int(), isWinner: z.boolean() }).strict()).max(20),
}).strict();

type Handler = (req: import('express').Request) => Promise<unknown>;
const handle = (work: Handler, writes = false) => async (req: import('express').Request, res: import('express').Response) => {
  try {
    const body = await work(req);
    if (writes) clearResultsCache();
    res.json(body);
  } catch (error) {
    if (error instanceof CertificationInputError) return res.status(400).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
    console.error('[certification] Failed:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Certification update failed' });
  }
};

adminCertificationRouter.get('/', handle(async () => ({ states: await certificationOverview(prisma) })));
/** Kalshi markets that settled on an outcome other than the race's winner, to look into (#136). */
adminCertificationRouter.get('/settlements/disagreements', handle(async () => {
  const settled = await prisma.marketSettlement.count({ where: { provider: 'KALSHI' } });
  return { settled, disagreements: await settlementDisagreements(prisma) };
}));
adminCertificationRouter.get('/:state/totals', handle(async (req) => ({ races: await stateTotals(prisma, String(req.params.state)) })));
adminCertificationRouter.put('/:state/deadline', handle(async (req) => {
  const body = deadlineBody.parse(req.body);
  const row = await setDeadline(prisma, { state: String(req.params.state), ...body });
  return { state: row.stateCode, deadline: row.deadline.toISOString().slice(0, 10) };
}, true));
adminCertificationRouter.post('/:state/events', handle(async (req) => {
  const body = eventBody.parse(req.body);
  const recorded = await recordEvent(prisma, { state: String(req.params.state), ...body });
  // A certification triggers a finals pass for the state, so the stored count is civicAPI's latest before it is compared.
  if (body.type === 'CERTIFIED') {
    void import('../features/election-results/civicapi/run.js')
      .then(({ runFinalsPass }) => runFinalsPass(prisma, { states: [String(req.params.state)] }))
      .catch((error) => console.error('[certification] Finals pass failed:', error instanceof Error ? error.message : error));
  }
  return { ...recorded, finalsPass: body.type === 'CERTIFIED' ? 'started' : null };
}, true));
adminCertificationRouter.post('/:state/events/remove-latest', handle(async (req) => {
  const body = removeBody.parse(req.body ?? {});
  return removeLatestEvent(prisma, { state: String(req.params.state), race: body.race });
}, true));
adminCertificationRouter.put('/races/:contestId/ranked-choice', handle(async (req) => {
  const body = roundBody.parse(req.body);
  return setRankedChoiceRound(prisma, { contestId: String(req.params.contestId), ...body });
}, true));
