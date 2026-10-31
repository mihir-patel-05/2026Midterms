import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { verifyAdminAuth } from '../controllers/admin.controller.js';
import { adminStreams, publicStreams, setPanelShown, StreamInputError, updateStream, type LiveStreamsPayload } from '../services/live-streams.service.js';

/** GET /api/live-streams: the outlets on the War Room's Live coverage panel. Cached 30 seconds. */
export const liveStreamsRouter = Router();
const CACHE_MS = 30_000;
let cached: { at: number; body: LiveStreamsPayload } | null = null;

liveStreamsRouter.get('/', async (_req, res) => {
  if (!env.LIVE_STREAMS_ENABLED) return res.status(404).json({ error: 'Not Found' });
  try {
    if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), body: await publicStreams(prisma) };
    res.set('Cache-Control', 'public, max-age=30');
    return res.json(cached.body);
  } catch (error) {
    console.error('[live-streams] Read failed:', error instanceof Error ? error.message : error);
    return res.status(503).json({ error: 'Live coverage is unavailable' });
  }
});

/** /api/admin/live-streams: set each outlet's video or channel, and show or hide the panel. */
export const adminLiveStreamsRouter = Router();
adminLiveStreamsRouter.use(verifyAdminAuth);

export const streamBody = z.object({
  input: z.string().max(500).nullable().optional(),
  isEnabled: z.boolean().optional(),
}).strict();
export const panelBody = z.object({ shown: z.boolean() }).strict();

adminLiveStreamsRouter.get('/', async (_req, res) => {
  res.json(await adminStreams(prisma));
});

adminLiveStreamsRouter.put('/panel', async (req, res) => {
  const body = panelBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "shown": true | false }' });
  await setPanelShown(prisma, body.data.shown);
  cached = null;
  return res.json({ shown: body.data.shown });
});

adminLiveStreamsRouter.put('/:key', async (req, res) => {
  const body = streamBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "input": "<YouTube link or id>" } and/or { "isEnabled": true | false }' });
  try {
    const stream = await updateStream(prisma, req.params.key, body.data);
    if (!stream) return res.status(404).json({ error: 'No such outlet' });
    cached = null;
    return res.json({ stream });
  } catch (error) {
    if (error instanceof StreamInputError) return res.status(400).json({ error: error.message });
    throw error;
  }
});
