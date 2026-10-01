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
    };
  }, [searchParams]);

  const update = useCallback((patch: Partial<MonitorParams>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
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
