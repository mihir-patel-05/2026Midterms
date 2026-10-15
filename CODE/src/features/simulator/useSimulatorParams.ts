import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DISTRICT_CODES, ELECTORAL_VOTES } from "./electoralVotes";
import { EMPTY_SCENARIO, type Outcome, type Pick, type Rating, type Scenario } from "./model";

/** Baselines on offer; the newest is the default. */
export const BASE_YEARS = [2024, 2020, 2016, 2012, 2008, 2004, 2000];
export const SWING_LIMIT = 15;
/** Keeps shared links a reasonable length (about 12 characters per county). */
export const MAX_COUNTY_EDITS = 300;

export type SimLayer = "states" | "counties";

export interface SimulatorParams {
  scenario: Scenario;
  layer: SimLayer;
  /** State in the side panel. */
  state: string | null;
  /** County in the side panel (5-digit FIPS), inside `state`. */
  county: string | null;
  /** True when the link held more county edits than are kept. */
  truncated: boolean;
}

export interface SimulatorPatch {
  scenario?: Partial<Scenario>;
  layer?: SimLayer;
  state?: string | null;
  county?: string | null;
}

const ratingLetters: Record<Rating, string> = { safe: "s", likely: "k", lean: "l" };
const ratingsByLetter = Object.fromEntries(Object.entries(ratingLetters).map(([rating, letter]) => [letter, rating])) as Record<string, Rating>;
const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const isState = (code: string) => code in ELECTORAL_VOTES;

/** "PA2,GA-1.5" → { PA: 2, GA: -1.5 }. */
export function parseSwings(value: string | null, valid: (code: string) => boolean = isState) {
  const swings: Record<string, number> = {};
  for (const item of value?.split(",") ?? []) {
    const match = /^([A-Z]{2})(-?\d+(?:\.\d+)?)$/.exec(item);
    if (match && valid(match[1])) swings[match[1]] = clamp(round1(Number(match[2])), SWING_LIMIT);
  }
  return swings;
}

/** "AZDl,GAT" → { AZ: lean D, GA: tossup }. */
export function parsePicks(value: string | null, valid: (code: string) => boolean = isState) {
  const picks: Record<string, Pick> = {};
  for (const item of value?.split(",") ?? []) {
    const match = /^([A-Z]{2})(?:([DR])([skl])|T)$/.exec(item);
    if (!match || !valid(match[1])) continue;
    picks[match[1]] = match[2] ? { party: match[2] as "D" | "R", rating: ratingsByLetter[match[3]] } : { party: "T" };
  }
  return picks;
}

/** "ME2R,NE2T" → { "ME-2": "R", "NE-2": "T" }. */
function parseDistricts(value: string | null) {
  const districts: Record<string, Outcome> = {};
  for (const item of value?.split(",") ?? []) {
    const match = /^([A-Z]{2})(\d)([DRT])$/.exec(item);
    const code = match && `${match[1]}-${match[2]}`;
    if (code && DISTRICT_CODES.includes(code)) districts[code] = match[3] as Outcome;
  }
  return districts;
}

/** "04013:1.5,13121:-30" → county margins, capped at MAX_COUNTY_EDITS. */
export function parseCounties(value: string | null) {
  const counties: Record<string, number> = {};
  let count = 0;
  let truncated = false;
  for (const item of value?.split(",") ?? []) {
    const match = /^(\d{5}):(-?\d+(?:\.\d+)?)$/.exec(item);
    if (!match) continue;
    if (count >= MAX_COUNTY_EDITS) {
      truncated = true;
      break;
    }
    counties[match[1]] = clamp(round1(Number(match[2])), 100);
    count++;
  }
  return { counties, truncated };
}

/**
 * Baseline, swings, county margins, and state picks: everything but Maine's and Nebraska's
 * districts, which the midterm simulator's Senate side shares. `valid` limits which states count.
 */
export function parseCountyScenario(search: URLSearchParams, valid: (code: string) => boolean = isState) {
  const baseParam = search.get("base");
  const year = Number(baseParam);
  const base = baseParam === "blank" ? null : BASE_YEARS.includes(year) ? year : EMPTY_SCENARIO.base;
  const swing = Number(search.get("swing"));
  const { counties, truncated } = parseCounties(search.get("c"));
  return {
    scenario: {
      base,
      swing: Number.isFinite(swing) ? clamp(round1(swing), SWING_LIMIT) : 0,
      stateSwing: parseSwings(search.get("ss"), valid),
      counties,
      picks: parsePicks(search.get("p"), valid),
    },
    truncated,
  };
}

export function parseScenario(search: URLSearchParams): { scenario: Scenario; truncated: boolean } {
  const { scenario, truncated } = parseCountyScenario(search);
  return { scenario: { ...scenario, districts: parseDistricts(search.get("d")) }, truncated };
}

/** Sets `key`, or removes it when `value` is empty. */
export const setParam = (search: URLSearchParams, key: string, value: string) => (value ? search.set(key, value) : search.delete(key));

/** Writes everything but the districts into `search`, leaving defaults out so plain links stay short. */
export function writeCountyScenario(search: URLSearchParams, scenario: Omit<Scenario, "districts">) {
  const set = (key: string, value: string) => setParam(search, key, value);
  set("base", scenario.base === null ? "blank" : scenario.base === EMPTY_SCENARIO.base ? "" : String(scenario.base));
  set("swing", scenario.swing ? String(round1(scenario.swing)) : "");
  set("ss", Object.entries(scenario.stateSwing).filter(([, value]) => value).map(([code, value]) => `${code}${round1(value)}`).join(","));
  set("p", Object.entries(scenario.picks).map(([code, pick]) => (pick.party === "T" ? `${code}T` : `${code}${pick.party}${ratingLetters[pick.rating]}`)).join(","));
  set("c", Object.entries(scenario.counties).slice(0, MAX_COUNTY_EDITS).map(([fips, margin]) => `${fips}:${round1(margin)}`).join(","));
}

/** Writes a scenario into `search`, leaving defaults out so plain links stay short. */
export function writeScenario(search: URLSearchParams, scenario: Scenario) {
  writeCountyScenario(search, scenario);
  setParam(search, "d", Object.entries(scenario.districts).map(([code, winner]) => `${code.replace("-", "")}${winner}`).join(","));
}

/**
 * The whole scenario lives in the URL, so copying the link shares it exactly, and the back button
 * is left alone (`replace`). Unknown or out-of-range values are dropped rather than erroring.
 */
export function useSimulatorParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<SimulatorParams>(() => {
    const { scenario, truncated } = parseScenario(searchParams);
    const state = searchParams.get("state");
    const county = searchParams.get("county");
    return {
      scenario,
      truncated,
      layer: searchParams.get("layer") === "counties" ? "counties" : "states",
      state: state && isState(state) ? state : null,
      county: county && /^\d{5}$/.test(county) ? county : null,
    };
  }, [searchParams]);

  const update = useCallback((patch: SimulatorPatch) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (patch.scenario) writeScenario(next, { ...parseScenario(current).scenario, ...patch.scenario });
      if (patch.layer !== undefined) {
        if (patch.layer === "counties") next.set("layer", "counties");
        else next.delete("layer");
      }
      for (const key of ["state", "county"] as const) {
        const value = patch[key];
        if (value === undefined) continue;
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return [params, update] as const;
}
