/**
 * Election-night network streams for the War Room's Live coverage panel (PLAN.md §4.7). Admins set
 * each outlet's YouTube video or channel on the night; the web build never changes. Outlets are
 * listed alphabetically and treated the same. Calls and numbers in a broadcast are the network's.
 */
import type { PrismaClient } from '@prisma/client';

export const PANEL_SETTING = 'live_streams_panel';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export interface PublicStream {
  key: string;
  name: string;
  /** What the player embeds: one video, or the channel's current live stream. Null means link-out only. */
  embed: { videoId: string } | { channelId: string } | null;
  watchUrl: string;
}

export interface LiveStreamsPayload {
  /** False when an admin has hidden the panel. */
  shown: boolean;
  streams: PublicStream[];
  updatedAt: string | null;
}

export class StreamInputError extends Error {}

/**
 * A pasted YouTube link or id: `https://www.youtube.com/watch?v=…`, `youtu.be/…`, `/live/…`, `/embed/…`,
 * `/channel/UC…`, or a bare video or channel id. Handles (`@ABCNews`) carry no id, so they are refused.
 */
export function parseStreamInput(input: string): { videoId: string } | { channelId: string } {
  const value = input.trim();
  if (VIDEO_ID.test(value)) return { videoId: value };
  if (CHANNEL_ID.test(value)) return { channelId: value };
  let url: URL;
  try {
    url = new URL(value.startsWith('http') ? value : `https://${value}`);
  } catch {
    throw new StreamInputError('Paste a YouTube video link, a channel link (youtube.com/channel/UC…), or an id');
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) throw new StreamInputError('Only YouTube links can be embedded');
  const parts = url.pathname.split('/').filter(Boolean);
  const video = host === 'youtu.be' ? parts[0]
    : url.searchParams.get('v') ?? (['live', 'embed', 'shorts'].includes(parts[0]) ? parts[1] : undefined);
  if (video && VIDEO_ID.test(video) && video !== 'live_stream') return { videoId: video };
  const channel = parts[0] === 'channel' ? parts[1] : url.searchParams.get('channel');
  if (channel && CHANNEL_ID.test(channel)) return { channelId: channel };
  if (parts[0]?.startsWith('@')) throw new StreamInputError('A handle link has no channel id. Open the channel, use Share > Copy channel ID, or paste the live video link');
  throw new StreamInputError('No YouTube video or channel id in that link');
}

export async function publicStreams(db: PrismaClient): Promise<LiveStreamsPayload> {
  const [rows, setting] = await Promise.all([
    db.liveStream.findMany({ where: { isEnabled: true }, orderBy: { name: 'asc' } }),
    db.appSetting.findUnique({ where: { key: PANEL_SETTING } }),
  ]);
  const updated = [...rows.map((row) => row.updatedAt), ...(setting ? [setting.updatedAt] : [])].sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    shown: setting?.value !== 'hidden',
    streams: rows.map((row) => ({
      key: row.key,
      name: row.name,
      embed: row.videoId ? { videoId: row.videoId } : row.channelId ? { channelId: row.channelId } : null,
      watchUrl: row.videoId ? `https://www.youtube.com/watch?v=${row.videoId}` : row.channelId ? `https://www.youtube.com/channel/${row.channelId}/live` : row.watchUrl,
    })),
    updatedAt: updated?.toISOString() ?? null,
  };
}

export async function adminStreams(db: PrismaClient) {
  const [streams, setting] = await Promise.all([
    db.liveStream.findMany({ orderBy: { name: 'asc' } }),
    db.appSetting.findUnique({ where: { key: PANEL_SETTING } }),
  ]);
  return { shown: setting?.value !== 'hidden', streams };
}

/** Sets an outlet's stream from a pasted link (empty clears it), and/or turns the outlet on or off. */
export async function updateStream(db: PrismaClient, key: string, change: { input?: string | null; isEnabled?: boolean }) {
  const existing = await db.liveStream.findUnique({ where: { key } });
  if (!existing) return null;
  const data: { videoId?: string | null; channelId?: string | null; isEnabled?: boolean } = {};
  if (change.input !== undefined) {
    if (!change.input?.trim()) Object.assign(data, { videoId: null, channelId: null });
    else {
      const parsed = parseStreamInput(change.input);
      Object.assign(data, 'videoId' in parsed ? { videoId: parsed.videoId, channelId: existing.channelId } : { channelId: parsed.channelId, videoId: null });
    }
  }
  if (change.isEnabled !== undefined) data.isEnabled = change.isEnabled;
  return db.liveStream.update({ where: { key }, data });
}

export async function setPanelShown(db: PrismaClient, shown: boolean) {
  await db.appSetting.upsert({
    where: { key: PANEL_SETTING },
    create: { key: PANEL_SETTING, value: shown ? 'shown' : 'hidden' },
    update: { value: shown ? 'shown' : 'hidden' },
  });
}
