import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { costOfLivingEnabled } from "@/lib/featureFlags";

/** GET /api/cost-of-living (PLAN.md §4.8): weekly EIA gasoline and diesel prices for a state, or the U.S. */

export interface Change { dollars: number; percent: number; from: string }

export interface FuelView {
  fuel: "gasoline" | "diesel";
  area: { code: string; name: string; kind: "nation" | "state" | "region" };
  /** The area is a region standing in for the state; never shown as the state's own price. */
  regional: boolean;
  latest: { date: string; value: number } | null;
  us: { date: string; value: number } | null;
  vsUs: { dollars: number; percent: number } | null;
  changes: { week: Change | null; month: Change | null; year: Change | null };
  usChanges: { week: Change | null; month: Change | null; year: Change | null };
  history: Array<{ date: string; value: number | null; us: number | null }>;
  stale: boolean;
}

export interface CostOfLiving {
  state: string | null;
  fuels: FuelView[];
  source: { name: string; url: string; fetchedAt: string | null; attribution: string };
}

export class NotLoaded extends Error {}

export function useCostOfLiving(state: string | null) {
  return useQuery({
    queryKey: ["war-room", "cost-of-living", state],
    enabled: costOfLivingEnabled,
    staleTime: 15 * 60_000,
    retry: (count, error) => !(error instanceof NotLoaded) && count < 1,
    queryFn: async ({ signal }): Promise<CostOfLiving | null> => {
      const response = await fetch(`${API_BASE_URL}/api/cost-of-living${state ? `?state=${state}` : ""}`, { signal });
      if (response.status === 404) return null;
      if (response.status === 503) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        if (body?.code === "NOT_LOADED") throw new NotLoaded();
      }
      if (!response.ok) throw new Error(`Cost of living returned ${response.status}`);
      return response.json() as Promise<CostOfLiving>;
    },
  });
}

export const dollars = (value: number) => `$${value.toFixed(3)}`;
export const signedDollars = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}$${Math.abs(value).toFixed(2)}`;
export const signedPercent = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(1)}%`;

/** SVG polyline points for one line of the chart; nulls break the line. */
export function fuelLines(history: FuelView["history"], pick: "value" | "us", range: [number, number], width: number, height: number): string[] {
  const [low, high] = range;
  const n = history.length;
  const lines: string[] = [];
  let current: string[] = [];
  history.forEach((point, index) => {
    const value = point[pick];
    if (value === null) {
      if (current.length > 1) lines.push(current.join(" "));
      current = [];
      return;
    }
    const x = n > 1 ? (index / (n - 1)) * width : 0;
    const y = (1 - (value - low) / (high - low || 1)) * height;
    current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (current.length > 1) lines.push(current.join(" "));
  return lines;
}

/** A padded price range covering both lines, rounded out to 10¢. */
export function fuelRange(history: FuelView["history"]): [number, number] {
  const values = history.flatMap((point) => [point.value, point.us]).filter((value): value is number => value !== null);
  if (values.length === 0) return [0, 1];
  return [Math.floor(Math.min(...values) * 10) / 10, Math.ceil(Math.max(...values) * 10) / 10];
}
