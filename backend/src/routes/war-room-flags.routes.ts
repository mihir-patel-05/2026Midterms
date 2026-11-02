import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { verifyAdminAuth } from '../controllers/admin.controller.js';
import { isWarRoomFlag, readWarRoomFlags, setWarRoomFlag, WAR_ROOM_FLAGS, type WarRoomFlag } from '../services/war-room-flags.service.js';

/** GET /api/war-room/flags: which War Room extras are on. Cached 30 seconds; every flag reads as on if the database is down. */
export const warRoomFlagsRouter = Router();
const CACHE_MS = 30_000;
let cached: { at: number; body: { flags: Record<WarRoomFlag, boolean> } } | null = null;

warRoomFlagsRouter.get('/', async (_req, res) => {
  try {
    if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), body: { flags: await readWarRoomFlags(prisma) } };
    res.set('Cache-Control', 'public, max-age=30');
    return res.json(cached.body);
  } catch (error) {
    console.error('[war-room-flags] Read failed:', error instanceof Error ? error.message : error);
    // Keep serving the last answer so a database blip never flips a switch an admin turned off.
    if (cached) return res.json(cached.body);
    return res.status(503).json({ error: 'War Room flags are unavailable' });
  }
});

/** /api/admin/war-room/flags: list the switches, and turn one on or off. */
export const adminWarRoomFlagsRouter = Router();
adminWarRoomFlagsRouter.use(verifyAdminAuth);

export const flagBody = z.object({ enabled: z.boolean() }).strict();

adminWarRoomFlagsRouter.get('/', async (_req, res) => {
  const flags = await readWarRoomFlags(prisma);
  res.json({ flags: Object.entries(WAR_ROOM_FLAGS).map(([name, label]) => ({ name, label, enabled: flags[name as WarRoomFlag] })) });
});

adminWarRoomFlagsRouter.put('/:name', async (req, res) => {
  const { name } = req.params;
  if (!isWarRoomFlag(name)) return res.status(404).json({ error: 'No such flag' });
  const body = flagBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Send { "enabled": true | false }' });
  await setWarRoomFlag(prisma, name, body.data.enabled);
  cached = null;
  return res.json({ name, enabled: body.data.enabled });
});
