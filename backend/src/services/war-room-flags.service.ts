/**
 * Runtime off switches for the War Room's election-night extras. Each is a row in app_settings
 * (`war_room_flag:<name>` = `on` | `off`), so an admin can turn one off without a deploy; a missing row means on.
 * The site picks a change up within about a minute (30 s here, 60 s in the browser).
 */
import type { PrismaClient } from '@prisma/client';

export const WAR_ROOM_FLAGS = {
  runoff_labels: 'Runoff and ranked-choice labels (Georgia, Maine, Alaska)',
  next_close_countdown: 'Countdown to the next poll close',
  retracted_calls: 'Call retracted entries in the call log',
  stale_prices: 'Stale price marker and Kalshi reconnect check',
  caucus_note: 'Independent caucus note (Osborn, Nebraska)',
  control_banner: 'Chamber control decided banner',
  hide_coming_soon: 'Hide the Coming soon panels',
  watchlist_alerts: 'Alerts when a watched race is called',
  wall_mode: 'Wall mode: a tile grid of the night for a TV or second screen',
  market_alerts: 'Market vs count: alerts and panel when the count leader and the Kalshi favorite disagree, or a market swings 20 points',
} as const;

export type WarRoomFlag = keyof typeof WAR_ROOM_FLAGS;
export const WAR_ROOM_FLAG_NAMES = Object.keys(WAR_ROOM_FLAGS) as WarRoomFlag[];
const PREFIX = 'war_room_flag:';

export const isWarRoomFlag = (name: string): name is WarRoomFlag => Object.prototype.hasOwnProperty.call(WAR_ROOM_FLAGS, name);

/** Every flag, on unless a row says `off`. Unknown rows are ignored. */
export function flagsFromRows(rows: Array<{ key: string; value: string }>): Record<WarRoomFlag, boolean> {
  const flags = Object.fromEntries(WAR_ROOM_FLAG_NAMES.map((name) => [name, true])) as Record<WarRoomFlag, boolean>;
  for (const row of rows) {
    const name = row.key.slice(PREFIX.length);
    if (row.key.startsWith(PREFIX) && isWarRoomFlag(name)) flags[name] = row.value !== 'off';
  }
  return flags;
}

export async function readWarRoomFlags(db: PrismaClient): Promise<Record<WarRoomFlag, boolean>> {
  const rows = await db.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
  return flagsFromRows(rows);
}

export async function setWarRoomFlag(db: PrismaClient, name: WarRoomFlag, enabled: boolean) {
  const value = enabled ? 'on' : 'off';
  await db.appSetting.upsert({ where: { key: `${PREFIX}${name}` }, create: { key: `${PREFIX}${name}`, value }, update: { value } });
}
