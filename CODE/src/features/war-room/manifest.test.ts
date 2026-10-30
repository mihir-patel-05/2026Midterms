import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicFile = (path: string) => fileURLToPath(new URL(`../../../public/${path.replace(/^\//, "")}`, import.meta.url));
const manifest = JSON.parse(readFileSync(publicFile("war-room.webmanifest"), "utf8"));

/** Width and height from a PNG's header. */
function pngSize(path: string) {
  const bytes = readFileSync(publicFile(path));
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("the War Room app manifest", () => {
  it("has what browsers need to offer an install", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
    const sizes = manifest.icons.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("opens on the War Room, and keeps its own pages and shortcuts in its scope", () => {
    expect(manifest.start_url).toBe("/war-room");
    for (const url of [manifest.start_url, ...manifest.shortcuts.map((shortcut) => shortcut.url)]) {
      expect(url.startsWith(manifest.scope)).toBe(true);
    }
  });

  it("lists icons that exist at the sizes it gives", () => {
    for (const icon of manifest.icons) expect(pngSize(icon.src)).toBe(icon.sizes);
    expect(pngSize("war-room-apple-touch-icon.png")).toBe("180x180");
  });
});
