import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DetailTab, MapLayer, OfficeFilter } from "./types";

const offices: OfficeFilter[] = ["ALL", "US_SENATE", "US_HOUSE"];
const layers: MapLayer[] = ["states", "districts", "counties"];
const tabs: DetailTab[] = ["overview", "counties", "finance"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export interface MonitorParams {
  state: string | null;
  district: string | null;
  office: OfficeFilter;
  contest: string | null;
  layer: MapLayer;
  tab: DetailTab;
  /** Shareable camera, like `?lat=…&lon=…&zoom=…`; null until the user pans or zooms. */
  view: { lat: number; lon: number; zoom: number } | null;
}

function parseView(searchParams: URLSearchParams) {
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const zoom = Number(searchParams.get("zoom"));
  const valid = searchParams.has("lat") && searchParams.has("lon") && searchParams.has("zoom")
    && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 && zoom >= 0 && zoom <= 22;
  return valid ? { lat, lon, zoom } : null;
}

/**
 * Dashboard selection lives in the URL so every view is shareable and the
 * back button works. Unknown values fall back to defaults instead of erroring.
 */
export function useMonitorParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<MonitorParams>(() => {
    const state = searchParams.get("state");
    const district = searchParams.get("district");
    return {
      state: state && /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null,
      district: district && /^\d{2}$/.test(district) ? district : null,
      office: pick(searchParams.get("office"), offices, "ALL"),
      contest: searchParams.get("contest"),
      layer: pick(searchParams.get("layer"), layers, "states"),
      tab: pick(searchParams.get("tab"), tabs, "overview"),
      view: parseView(searchParams),
    };
  }, [searchParams]);

  const update = useCallback((patch: Partial<MonitorParams>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      const { view, ...rest } = patch;
      if (view !== undefined) {
        for (const key of ["lat", "lon", "zoom"] as const) {
          if (view) next.set(key, String(view[key]));
          else next.delete(key);
        }
      }
      for (const [key, value] of Object.entries(rest)) {
        const isDefault = value === null || value === undefined
          || (key === "office" && value === "ALL")
          || (key === "layer" && value === "states")
          || (key === "tab" && value === "overview");
        if (isDefault) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return [params, update] as const;
}
