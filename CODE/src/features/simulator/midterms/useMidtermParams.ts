import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ELECTORAL_VOTES } from "../electoralVotes";
import type { Outcome } from "../model";
import { parseCountyScenario, setParam, writeCountyScenario, type SimLayer } from "../useSimulatorParams";
import type { SenateScenario } from "./model";
import { isHouseDistrict, isSenateRace } from "./races2026";

export type Chamber = "senate" | "house";
/** The House baseline: 2024 winners, or a blank map of tossups. */
export type HouseBase = 2024 | null;

export interface HouseScenario {
  base: HouseBase;
  /** "PA-07" → winner set by hand. */
  picks: Record<string, Outcome>;
}

export interface MidtermParams {
  chamber: Chamber;
  senate: SenateScenario;
  house: HouseScenario;
  /** Senate map layer. */
  layer: SimLayer;
  /** State in the side panel (either chamber). */
  state: string | null;
  /** County in the side panel (5-digit FIPS), Senate only. */
  county: string | null;
  /** District in focus ("PA-07"), House only. */
  district: string | null;
  truncated: boolean;
}

export interface MidtermPatch {
  chamber?: Chamber;
  senate?: Partial<SenateScenario>;
  house?: Partial<HouseScenario>;
  layer?: SimLayer;
  state?: string | null;
  county?: string | null;
  district?: string | null;
}

/** "PA07D,AK00R" → { "PA-07": "D", "AK-00": "R" }. */
export function parseHousePicks(value: string | null) {
  const picks: Record<string, Outcome> = {};
  for (const item of value?.split(",") ?? []) {
    const match = /^([A-Z]{2})(\d{2})([DRT])$/.exec(item);
    const code = match && `${match[1]}-${match[2]}`;
    if (code && isHouseDistrict(code)) picks[code] = match[3] as Outcome;
  }
  return picks;
}

export function parseHouse(search: URLSearchParams): HouseScenario {
  return { base: search.get("hbase") === "blank" ? null : 2024, picks: parseHousePicks(search.get("h")) };
}

export function writeHouse(search: URLSearchParams, house: HouseScenario) {
  setParam(search, "hbase", house.base === null ? "blank" : "");
  setParam(search, "h", Object.entries(house.picks).map(([code, winner]) => `${code.replace("-", "")}${winner}`).join(","));
}

export const parseSenate = (search: URLSearchParams) => parseCountyScenario(search, isSenateRace);

/**
 * The midterm scenario lives in the URL like the electoral college one: the Senate side uses the same
 * keys (base, swing, ss, c, p), limited to the 2026 race states, and the House side adds h and hbase.
 */
export function useMidtermParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<MidtermParams>(() => {
    const { scenario, truncated } = parseSenate(searchParams);
    const state = searchParams.get("state");
    const county = searchParams.get("county");
    const district = searchParams.get("district");
    return {
      chamber: searchParams.get("chamber") === "house" ? "house" : "senate",
      senate: scenario,
      house: parseHouse(searchParams),
      truncated,
      layer: searchParams.get("layer") === "counties" ? "counties" : "states",
      state: state && state in ELECTORAL_VOTES ? state : null,
      county: county && /^\d{5}$/.test(county) ? county : null,
      district: district && isHouseDistrict(district) ? district : null,
    };
  }, [searchParams]);

  const update = useCallback((patch: MidtermPatch) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (patch.senate) writeCountyScenario(next, { ...parseSenate(current).scenario, ...patch.senate });
      if (patch.house) writeHouse(next, { ...parseHouse(current), ...patch.house });
      if (patch.chamber !== undefined) setParam(next, "chamber", patch.chamber === "house" ? "house" : "");
      if (patch.layer !== undefined) setParam(next, "layer", patch.layer === "counties" ? "counties" : "");
      for (const key of ["state", "county", "district"] as const) {
        const value = patch[key];
        if (value !== undefined) setParam(next, key, value ?? "");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return [params, update] as const;
}
