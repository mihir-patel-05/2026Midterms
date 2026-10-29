import type { MonitorParams } from "@/features/election-monitor/useMonitorParams";
import type { OddsOffice } from "@/features/election-monitor/oddsMap";
import type { MapLayer } from "@/features/election-monitor/types";

/**
 * The Command map reads the monitor's parameters, so a monitor link opens the same view with only the path
 * changed. Market leader is the monitor's `mode=odds`, by `ooffice`. Seat holder and flip watch are War Room
 * lenses on that same map, in `lens`, which the monitor ignores.
 */
export type Lens = "leader" | "holder" | "flip";
export const LENSES: Array<{ id: Lens; label: string; senate: string; house: string }> = [
  { id: "leader", label: "Market leader", senate: "Market leader by state", house: "Market leader by district" },
  { id: "holder", label: "Seat holder", senate: "Who holds the seat today", house: "Who holds the seat today" },
  { id: "flip", label: "Flip watch", senate: "Flip watch · leader vs holder", house: "Flip watch · leader vs holder" },
];

export function readLens(search: URLSearchParams): Lens {
  const value = search.get("lens");
  return value === "holder" || value === "flip" ? value : "leader";
}

type TheaterParams = Pick<MonitorParams, "mode" | "oddsOffice" | "layer">;

/** The chamber on the map: `ooffice` in market-odds mode, as on the monitor; otherwise districts mean the House. */
export function theaterOffice(params: TheaterParams): OddsOffice {
  if (params.mode === "odds") return params.oddsOffice;
  return params.layer === "districts" ? "house" : "senate";
}

/** States for the Senate, districts for the House, or counties when asked for. */
export function theaterLayer(params: TheaterParams): MapLayer {
  if (params.layer === "counties") return "counties";
  return theaterOffice(params) === "house" ? "districts" : "states";
}

/** The parameters for a layer button. States and districts also pick the chamber, so the monitor agrees. */
export function layerPatch(layer: MapLayer): Partial<MonitorParams> {
  if (layer === "counties") return { layer, mode: "odds" };
  return { layer, mode: "odds", oddsOffice: layer === "districts" ? "house" : "senate" };
}

/** The query string for a lens button. */
export function lensSearch(current: URLSearchParams, lens: Lens) {
  const next = new URLSearchParams(current);
  if (lens === "leader") next.delete("lens");
  else next.set("lens", lens);
  next.set("mode", "odds");
  return next;
}
