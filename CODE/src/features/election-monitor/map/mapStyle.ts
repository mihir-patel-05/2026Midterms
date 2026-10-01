import type { StyleSpecification } from "maplibre-gl";

/** Dark vector basemap. Override with VITE_MAP_STYLE_URL (OpenFreeMap, MapTiler, self-hosted PMTiles…). */
export const DEFAULT_MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Used when the basemap cannot be reached: the election overlays still render on a plain background. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#070b12" } }],
};

export async function resolveMapStyle(signal: AbortSignal): Promise<{ style: StyleSpecification | string; isFallback: boolean }> {
  const url = import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  const timer = window.setTimeout(abort, 6000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Map style returned ${response.status}`);
    return { style: (await response.json()) as StyleSpecification, isFallback: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return { style: FALLBACK_STYLE, isFallback: true };
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
