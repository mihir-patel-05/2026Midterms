import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { numberFormat } from "./constants";
import type { MapLayer } from "./types";

/**
 * Census map mode: every state, House district, or county coloured by one ACS
 * 5-year metric, from GET /api/demographics/map. The metric keys mirror
 * backend/src/services/census/acs-variables.ts.
 */
export type CensusKind = "count" | "share" | "median";

export interface CensusMetricOption {
  key: string;
  label: string;
  group: string;
  kind: CensusKind;
}

export const CENSUS_METRICS: CensusMetricOption[] = [
  { key: "median_household_income", label: "Median household income", group: "Income", kind: "median" },
  { key: "poverty_rate", label: "Below the poverty line", group: "Income", kind: "share" },
  { key: "income_under_25k", label: "Households under $25K", group: "Income", kind: "share" },
  { key: "income_200k_plus", label: "Households $200K or more", group: "Income", kind: "share" },
  { key: "unemployment_rate", label: "Unemployment rate", group: "Economy and housing", kind: "share" },
  { key: "owner_occupied", label: "Homes owner-occupied", group: "Economy and housing", kind: "share" },
  { key: "median_home_value", label: "Median home value", group: "Economy and housing", kind: "median" },
  { key: "race_white", label: "White", group: "Race and ethnicity", kind: "share" },
  { key: "race_black", label: "Black", group: "Race and ethnicity", kind: "share" },
  { key: "race_hispanic", label: "Hispanic or Latino", group: "Race and ethnicity", kind: "share" },
  { key: "race_asian", label: "Asian", group: "Race and ethnicity", kind: "share" },
  { key: "race_native", label: "American Indian and Alaska Native", group: "Race and ethnicity", kind: "share" },
  { key: "race_pacific", label: "Native Hawaiian and Pacific Islander", group: "Race and ethnicity", kind: "share" },
  { key: "race_multiracial", label: "Two or more races", group: "Race and ethnicity", kind: "share" },
  { key: "education_ba_plus", label: "Bachelor's degree or higher", group: "Education", kind: "share" },
  { key: "education_hs_plus", label: "High school graduate or higher", group: "Education", kind: "share" },
  { key: "age_18_29", label: "Age 18 to 29", group: "Age", kind: "share" },
  { key: "age_65_plus", label: "Age 65 and over", group: "Age", kind: "share" },
  { key: "age_under_18", label: "Under 18", group: "Age", kind: "share" },
  { key: "veterans", label: "Veterans (adults)", group: "Background", kind: "share" },
  { key: "foreign_born", label: "Born outside the U.S.", group: "Background", kind: "share" },
  { key: "population", label: "Total population", group: "Population", kind: "count" },
  { key: "cvap", label: "Citizens of voting age", group: "Population", kind: "count" },
];
export const CENSUS_METRIC_KEYS = CENSUS_METRICS.map((metric) => metric.key);
export const DEFAULT_CENSUS_METRIC = "median_household_income";
export const censusMetricOption = (key: string) => CENSUS_METRICS.find((metric) => metric.key === key) ?? CENSUS_METRICS[0];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 });
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCensusValue(kind: CensusKind, value: number | null, short = false) {
  if (value === null) return "—";
  if (kind === "share") return `${(value * 100).toFixed(1)}%`;
  if (kind === "median") return short ? compactMoney.format(value) : money.format(value);
  return short ? compactNumber.format(value) : numberFormat.format(value);
}

export interface CensusMapData {
  level: "state" | "county" | "district";
  acsYear: number;
  congress: number | null;
  metric: { key: string; label: string; kind: CensusKind };
  values: Record<string, number | null>;
  lowReliability: string[];
  nation: number | null;
  source: { dataset: string; fetchedAt: string | null };
}

const LEVELS: Record<MapLayer, CensusMapData["level"]> = { states: "state", counties: "county", districts: "district" };

/** Dark to light, one hue family: on the dark basemap higher values get more contrast. */
export const CENSUS_COLORS: Record<string, string> = {
  c0: "#173a4c",
  c1: "#1a5a6c",
  c2: "#1e7d88",
  c3: "#33a19b",
  c4: "#66c4ab",
  c5: "#b0e6c8",
};
export const CENSUS_NO_DATA = "#3a4350";
const BIN_COUNT = Object.keys(CENSUS_COLORS).length;

/** Quantile breaks (equal numbers of areas per colour), deduplicated so ties never make empty bins. */
export function quantileBreaks(values: number[], bins = BIN_COUNT): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < bins; i++) {
    const at = sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / bins))];
    if (breaks.length === 0 || at > breaks[breaks.length - 1]) breaks.push(at);
  }
  // A break equal to the minimum would leave the first bin empty.
  return breaks.filter((value) => value > sorted[0]);
}

export function binOf(value: number, breaks: number[]) {
  let index = 0;
  while (index < breaks.length && value >= breaks[index]) index++;
  return `c${index}`;
}

export interface CensusLegendStep {
  bin: string;
  color: string;
  label: string;
}

export interface CensusView {
  data: CensusMapData;
  bins: Map<string, string>;
  legend: CensusLegendStep[];
}

export function buildCensusView(data: CensusMapData): CensusView {
  const present = Object.values(data.values).filter((value): value is number => value !== null);
  const breaks = quantileBreaks(present);
  const bins = new Map<string, string>();
  for (const [code, value] of Object.entries(data.values)) if (value !== null) bins.set(code, binOf(value, breaks));
  const fmt = (value: number) => formatCensusValue(data.metric.kind, value, true);
  const min = present.length ? Math.min(...present) : null;
  const max = present.length ? Math.max(...present) : null;
  const edges = [min, ...breaks, max];
  const legend = edges.slice(0, -1).map((lower, index): CensusLegendStep => {
    const upper = edges[index + 1];
    return {
      bin: `c${index}`,
      color: CENSUS_COLORS[`c${index}`],
      label: lower === null || upper === null ? "—" : `${fmt(lower)}–${fmt(upper)}`,
    };
  });
  return { data, bins, legend };
}

export function useCensusMap(active: boolean, layer: MapLayer, metric: string) {
  const level = LEVELS[layer];
  const query = useQuery<CensusMapData, Error & { notLoaded?: boolean }>({
    queryKey: ["election-monitor", "census-map", level, metric],
    enabled: active,
    // ACS figures change once a year.
    staleTime: 60 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/demographics/map?${new URLSearchParams({ level, metric })}`, { signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { notLoaded: body.code === "NOT_LOADED" });
      return body.data as CensusMapData;
    },
  });
  // A response for another layer or metric is never painted, even for a moment.
  const data = query.data && query.data.level === level && query.data.metric.key === metric ? query.data : null;
  const view = useMemo(() => (active && data ? buildCensusView(data) : null), [active, data]);
  return { view, isLoading: active && !data && !query.isError, error: query.error };
}

/** Tooltip lines for one area in Census mode. */
export function describeCensus(view: CensusView | null, code: string, loading: boolean): string[] {
  if (!view) return [loading ? "Loading Census figures…" : "Census figures unavailable"];
  const { metric, values, nation, acsYear, lowReliability } = view.data;
  const value = values[code];
  if (value === undefined || value === null) return [`${metric.label}: no Census figure`];
  return [
    `${metric.label}: ${formatCensusValue(metric.kind, value)}${lowReliability.includes(code) ? " (low reliability)" : ""}`,
    nation === null ? `ACS ${acsYear} 5-year` : `U.S. ${formatCensusValue(metric.kind, nation)} · ACS ${acsYear} 5-year`,
  ];
}
