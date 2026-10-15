import { useMemo } from "react";
import type { MapLayer } from "./types";
import {
  decisiveRace, presidentResult, raceResult, shiftBin, shiftResult, usePastMeta, usePastYear, winnerBin,
  type AreaResult, type HouseYear, type PastMetric, type PastOffice, type PresidentYear, type SenateYear, type ShiftResult,
} from "./pastResults";
import { stateMapItems } from "@/features/election-dashboard/map";

export interface PastSelection {
  office: PastOffice;
  year: number | null;
  metric: PastMetric;
  from: number | null;
}

/** The 50 states, so a state with no Senate race is coloured "no race" rather than left blank. DC votes only for president. */
const STATE_CODES = stateMapItems.map((item) => item.code).filter((code) => code !== "DC");

/**
 * Turns the Past results selection in the URL into everything the page needs: the resolved year,
 * the map layer and its colour bins, and lookups for the tooltip and the detail panel.
 */
export function usePastResultsView(active: boolean, requested: PastSelection, countyLevel: boolean) {
  const meta = usePastMeta(active);
  const office = requested.office;
  const officeMeta = meta.data?.offices[office];
  const years = officeMeta?.years ?? [];
  const year = requested.year !== null && years.includes(requested.year) ? requested.year : years[years.length - 1] ?? null;
  // Shift compares two presidential elections; the default is the one before the chosen year.
  const metric: PastMetric = office === "president" ? requested.metric : "winner";
  const earlier = year === null ? [] : years.filter((item) => item < year);
  const from = metric === "shift" ? (requested.from !== null && earlier.includes(requested.from) ? requested.from : earlier[earlier.length - 1] ?? null) : null;

  const current = usePastYear<PresidentYear | SenateYear | HouseYear>(office, active ? year : null);
  const baseline = usePastYear<PresidentYear>("president", active && metric === "shift" ? from : null);

  const layer: MapLayer = office === "house" ? "districts" : office === "president" && countyLevel ? "counties" : "states";
  const houseLinesMatch = office !== "house" || (year !== null && (officeMeta?.mapYears ?? []).includes(year));

  const lookup = useMemo(() => {
    const data = current.data;
    if (!active || !data || data.year !== year) return null;
    const result = (code: string, level: MapLayer): AreaResult => {
      if (data.office === "president") {
        const votes = level === "counties" ? data.counties[code] : data.states[code]?.votes;
        return presidentResult(votes, data.candidates);
      }
      if (data.office === "senate") return raceResult(decisiveRace(data.states[code]));
      return raceResult(decisiveRace(data.districts[code]));
    };
    const shift = (code: string, level: MapLayer): ShiftResult | null => {
      if (metric !== "shift" || data.office !== "president" || !baseline.data) return null;
      const pick = (source: PresidentYear) => (level === "counties" ? source.counties[code] : source.states[code]?.votes);
      return shiftResult(pick(baseline.data), pick(data));
    };
    return { result, shift };
  }, [active, current.data, baseline.data, year, metric]);

  /** Colour bin per map feature, keyed the way the map's sources are (state code, FIPS, or "PA-07"). */
  const bins = useMemo(() => {
    if (!lookup || !houseLinesMatch || (metric === "shift" && !baseline.data)) return null;
    const data = current.data!;
    const codes = data.office === "president"
      ? layer === "counties" ? [...new Set([...Object.keys(data.counties), ...Object.keys(baseline.data?.counties ?? {})])] : [...new Set([...STATE_CODES, ...Object.keys(data.states)])]
      : data.office === "senate" ? STATE_CODES : Object.keys(data.districts);
    const map = new Map<string, string>();
    for (const code of codes) map.set(code, metric === "shift" ? shiftBin(lookup.shift(code, layer)!) : winnerBin(lookup.result(code, layer)));
    return map;
  }, [lookup, current.data, baseline.data, layer, metric, houseLinesMatch]);

  return {
    meta: meta.data,
    years,
    year,
    metric,
    from,
    earlierYears: earlier,
    layer,
    houseLinesMatch,
    bins,
    lookup,
    data: current.data,
    loading: active && (meta.isLoading || current.isLoading || baseline.isLoading),
    error: active && (meta.isError || current.isError || baseline.isError),
  };
}

export type PastResultsView = ReturnType<typeof usePastResultsView>;
