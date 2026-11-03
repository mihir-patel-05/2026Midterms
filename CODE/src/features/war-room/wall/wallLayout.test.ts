import { describe, expect, it } from "vitest";
import { DEFAULT_WALL, moveTile, readWallLayout, setColumns, toggleTile, WALL_TILES } from "./wallLayout";

describe("wall layout", () => {
  it("reads a stored layout and drops what it does not know", () => {
    expect(readWallLayout(null)).toBeNull();
    expect(readWallLayout("not json")).toBeNull();
    expect(readWallLayout(JSON.stringify({ columns: 2 }))).toBeNull();
    expect(readWallLayout(JSON.stringify({ tiles: ["calls", "nope", "calls", 4, "odds"], columns: 9 }))).toEqual({ tiles: ["calls", "odds"], columns: DEFAULT_WALL.columns });
    expect(readWallLayout(JSON.stringify({ tiles: [], columns: 4 }))).toEqual({ tiles: [], columns: 4 });
  });

  it("defaults to known tiles", () => {
    const ids = new Set<string>(WALL_TILES.map((tile) => tile.id));
    expect(DEFAULT_WALL.tiles.every((id) => ids.has(id))).toBe(true);
  });

  it("toggles, moves and sets columns without changing the old layout", () => {
    const start = { tiles: ["calls", "odds", "market"] as const, columns: 3 as const };
    const layout = { ...start, tiles: [...start.tiles] };
    expect(toggleTile(layout, "odds").tiles).toEqual(["calls", "market"]);
    expect(toggleTile(layout, "health").tiles).toEqual(["calls", "odds", "market", "health"]);
    expect(moveTile(layout, "market", -1).tiles).toEqual(["calls", "market", "odds"]);
    expect(moveTile(layout, "calls", -1)).toBe(layout);
    expect(moveTile(layout, "market", 1)).toBe(layout);
    expect(moveTile(layout, "health", 1)).toBe(layout);
    expect(setColumns(layout, 1).columns).toBe(1);
    expect(layout.tiles).toEqual(["calls", "odds", "market"]);
  });
});
