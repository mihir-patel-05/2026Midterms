/**
 * Wall mode's layout: which tiles show, in what order, and how many columns. Kept per viewer in this browser, like
 * the watchlist; a layout that can't be stored still works for the visit. Unknown tiles and bad values are dropped,
 * so a layout saved by an older or newer War Room still loads.
 */

export const WALL_KEY = "warRoom.wall.v1";

export const WALL_TILES = [
  { id: "figures", label: "Night figures" },
  { id: "seats", label: "Seats called and leading" },
  { id: "odds", label: "Chamber control odds" },
  { id: "timeline", label: "Poll closing timeline" },
  { id: "key-races", label: "Key races" },
  { id: "calls", label: "Call log" },
  { id: "market", label: "Market vs count" },
  { id: "board", label: "Results board" },
  { id: "coverage", label: "Live coverage" },
  { id: "health", label: "System health" },
] as const;

export type WallTileId = (typeof WALL_TILES)[number]["id"];
export const WALL_COLUMNS = [1, 2, 3, 4] as const;
export type WallColumns = (typeof WALL_COLUMNS)[number];

export interface WallLayout {
  tiles: WallTileId[];
  columns: WallColumns;
}

const TILE_IDS = new Set<string>(WALL_TILES.map((tile) => tile.id));
const isTile = (value: unknown): value is WallTileId => typeof value === "string" && TILE_IDS.has(value);
const isColumns = (value: unknown): value is WallColumns => WALL_COLUMNS.includes(value as WallColumns);

export const DEFAULT_WALL: WallLayout = {
  tiles: ["figures", "seats", "odds", "key-races", "calls", "market", "timeline", "coverage"],
  columns: 3,
};

export const tileLabel = (id: WallTileId) => WALL_TILES.find((tile) => tile.id === id)!.label;

/** A stored layout, or null for none (or anything unreadable). */
export function readWallLayout(raw: string | null): WallLayout | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { tiles, columns } = value as { tiles?: unknown; columns?: unknown };
    if (!Array.isArray(tiles)) return null;
    return { tiles: [...new Set(tiles.filter(isTile))], columns: isColumns(columns) ? columns : DEFAULT_WALL.columns };
  } catch {
    return null;
  }
}

/** Shows a hidden tile at the end, or hides a shown one. */
export function toggleTile(layout: WallLayout, id: WallTileId): WallLayout {
  return { ...layout, tiles: layout.tiles.includes(id) ? layout.tiles.filter((tile) => tile !== id) : [...layout.tiles, id] };
}

/** Moves a shown tile one place earlier (-1) or later (1); at either end it stays put. */
export function moveTile(layout: WallLayout, id: WallTileId, step: -1 | 1): WallLayout {
  const from = layout.tiles.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= layout.tiles.length) return layout;
  const tiles = [...layout.tiles];
  [tiles[from], tiles[to]] = [tiles[to], tiles[from]];
  return { ...layout, tiles };
}

export const setColumns = (layout: WallLayout, columns: WallColumns): WallLayout => ({ ...layout, columns });

function storage() {
  try { return window.localStorage; } catch { return null; }
}

export function loadWallLayout(): WallLayout {
  try {
    return readWallLayout(storage()?.getItem(WALL_KEY) ?? null) ?? DEFAULT_WALL;
  } catch {
    return DEFAULT_WALL;
  }
}

export function saveWallLayout(layout: WallLayout | null) {
  try {
    if (layout === null) storage()?.removeItem(WALL_KEY);
    else storage()?.setItem(WALL_KEY, JSON.stringify(layout));
  } catch {
    // Private windows and full storage: the layout lasts for the visit.
  }
}
