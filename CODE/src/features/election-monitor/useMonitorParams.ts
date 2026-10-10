import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { DetailTab, MapLayer, OfficeFilter } from "./types";

const offices: OfficeFilter[] = ["ALL", "US_SENATE", "US_HOUSE"];
const layers: MapLayer[] = ["states", "districts", "counties"];
const tabs: DetailTab[] = ["overview", "counties", "finance"];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Upper bounds that keep shared URLs and demographics requests reasonable. */
export const MAX_SELECTED_COUNTIES = 300;
export const MAX_SELECTED_DISTRICTS = 60;

export interface MonitorParams {
  state: string | null;
  /** The district in focus: it picks the contest shown and frames the map. */
  district: string | null;
  /**
   * Further districts selected with Shift-click, including `district`. Empty when
   * only `district` is selected, so ordinary links stay short.
   */
  districts: string[];
  /** Selected counties (5-digit FIPS) in the selected state. */
  counties: string[];
  office: OfficeFilter;
  contest: string | null;
  layer: MapLayer;
  tab: DetailTab;
  /** Shareable camera, like `?lat=…&lon=…&zoom=…`; null until the user pans or zooms. */
  view: { lat: number; lon: number; zoom: number } | null;
}

function parseList(value: string | null, pattern: RegExp, max: number) {
  if (!value) return [];
  return [...new Set(value.split(",").filter((item) => pattern.test(item)))].sort().slice(0, max);
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
      districts: parseList(searchParams.get("districts"), /^\d{2}$/, MAX_SELECTED_DISTRICTS),
      counties: parseList(searchParams.get("counties"), /^\d{5}$/, MAX_SELECTED_COUNTIES),
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
        const isDefault = value === null || value === undefined || (Array.isArray(value) && value.length === 0)
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
