import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { loadCounties } from "./map/geo";

/** Mirrors the backend's /api/demographics response; see backend/src/services/demographics.service.ts. */
export interface DemographicMetric {
  key: string;
  label: string;
  topic: "population" | "age" | "race" | "income" | "education" | "economy" | "housing" | "background";
  table: string;
  kind: "count" | "share" | "median";
  /** A count, a share in [0, 1], or dollars. Null when Census published no value. */
  value: number | null;
  /** 90% margin of error, same unit as value. */
  moe: number | null;
  lowReliability: boolean;
  count?: number | null;
  estimated?: boolean;
  topCoded?: boolean;
}

export interface DemographicArea {
  geoType: "STATE" | "COUNTY" | "CONGRESSIONAL_DISTRICT" | "COUNTY_DISTRICT_PART";
  geoid: string;
  name: string;
  label: string;
  countyFips: string | null;
  districtCode: string | null;
  metrics: DemographicMetric[];
}

export interface DemographicsData {
  selection: { state: string; counties: string[]; districts: string[]; mode: "state" | "counties" | "districts" | "overlap" };
  acsYear: number;
  congress: number | null;
  combined: DemographicMetric[] | null;
  areas: DemographicArea[];
  missing: { counties: string[]; districts: string[] };
  noOverlap: { counties: string[]; districts: string[] };
  benchmarks: { state: { name: string; metrics: DemographicMetric[] } | null; nation: { name: string; metrics: DemographicMetric[] } | null };
  source: { name: string; attribution: string; homepageUrl: string | null; dataset: string; fetchedAt: string | null };
}

export class DemographicsError extends Error {
  constructor(message: string, readonly notLoaded: boolean) {
    super(message);
    this.name = "DemographicsError";
  }
}

export function useDemographics(state: string | null, counties: string[], districts: string[]) {
  // With no counties or districts, the API answers for the whole state.
  const enabled = Boolean(state);
  return useQuery<DemographicsData, Error>({
    queryKey: ["election-monitor", "demographics", state, counties.join(","), districts.join(",")],
    enabled,
    // ACS figures change once a year.
    staleTime: 60 * 60_000,
    // Keep the last answer on screen while a Shift-click adds an area, but never
    // show one state's figures under another state's name.
    placeholderData: (previous) => (previous?.selection.state === state ? previous : undefined),
    retry: (count, error) => !(error instanceof DemographicsError && error.notLoaded) && count < 1,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ state: state! });
      if (counties.length) query.set("counties", counties.join(","));
      if (districts.length) query.set("districts", districts.join(","));
      const response = await fetch(`${API_BASE_URL}/api/demographics?${query}`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new DemographicsError(body.error ?? `HTTP ${response.status}`, body.code === "NOT_LOADED");
      return body.data as DemographicsData;
    },
  });
}

/**
 * County names in a state, from the map's county geometry (already loaded once
 * the counties layer has been opened). Empty until it arrives.
 */
export function useCountyNames(state: string | null) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!state) {
      setNames(new Map());
      return;
    }
    let live = true;
    loadCounties()
      .then((data) => {
        if (!live) return;
        const inState = data.features.filter((item) => item.properties.state === state);
        setNames(new Map(inState.map((item) => [item.properties.fips, item.properties.name] as const).sort((a, b) => a[1].localeCompare(b[1]))));
      })
      .catch(() => live && setNames(new Map()));
    return () => {
      live = false;
    };
  }, [state]);
  return names;
}
