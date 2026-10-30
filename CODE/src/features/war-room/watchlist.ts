import { useSyncExternalStore } from "react";
import type { OddsView } from "@/features/election-monitor/oddsMap";
import { isRaceCode, parseRace } from "./raceCodes";

/**
 * The watchlist: race codes kept per viewer in this browser. There is no backend; a list that can't be stored
 * still works for the visit. Until the viewer changes it, the list is the default below.
 */

export const WATCHLIST_KEY = "warRoom.watchlist.v1";
export const WATCHLIST_MAX = 30;
/** Arizona, Georgia, Michigan, Nevada, North Carolina, Pennsylvania and Wisconsin. */
export const SWING_STATES = ["AZ", "GA", "MI", "NV", "NC", "PA", "WI"];
const DEFAULT_SIZE = 12;
const CLOSE_HOUSE = 65;

/**
 * The swing states' Senate races (only GA, MI and NC have one in 2026), then their House seats whose Kalshi leader
 * is under 65¢, closest first, 12 races at most. Before House prices arrive it is the Senate races alone.
 */
export function defaultWatchlist(senate: OddsView | null, house: OddsView | null): string[] {
  const senateCodes = SWING_STATES.filter((state) => isRaceCode(`${state}-SEN`) && (!senate || senate.races.get(state)?.bin !== "no_race"))
    .map((state) => `${state}-SEN`);
  const houseCodes = house
    ? [...house.races.values()]
      .filter((race) => SWING_STATES.includes(race.code.slice(0, 2)) && race.leader && race.leader.price < CLOSE_HOUSE)
      .sort((a, b) => a.leader!.price - b.leader!.price || a.code.localeCompare(b.code))
      .map((race) => race.code)
    : [];
  return [...senateCodes, ...houseCodes].slice(0, DEFAULT_SIZE);
}

/** A stored list, or null for none (or anything unreadable). Unknown codes and duplicates are dropped. */
export function readWatchlist(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return [...new Set(value.filter((code): code is string => typeof code === "string" && isRaceCode(code)))].slice(0, WATCHLIST_MAX);
  } catch {
    return null;
  }
}

export type AddResult = { list: string[]; code: string } | { error: string };

/** Adds what someone typed ("ME-SEN", "PA 8", "Ohio"), or says why it can't be added. */
export function addToWatchlist(list: string[], text: string): AddResult {
  const parsed = parseRace(text);
  if ("error" in parsed) return parsed;
  if (!parsed.code) return { error: `No Senate race in ${parsed.state} this year. Add a district, like ${parsed.state}-01.` };
  if (list.includes(parsed.code)) return { error: `${parsed.code} is already on your watchlist.` };
  if (list.length >= WATCHLIST_MAX) return { error: `The watchlist holds ${WATCHLIST_MAX} races.` };
  return { list: [...list, parsed.code], code: parsed.code };
}

export function toggleWatch(list: string[], code: string) {
  return list.includes(code) ? list.filter((item) => item !== code) : [...list, code].slice(0, WATCHLIST_MAX);
}

// ---------------------------------------------------------------------------
// Store, shared by every War Room screen and kept in step across tabs.
// ---------------------------------------------------------------------------

let custom: string[] | null | undefined;
/** The default is worked out once from the first House prices, so the list doesn't reshuffle as prices tick. */
let frozenDefault: { list: string[]; withHouse: boolean } | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load() {
  if (custom === undefined) {
    try {
      custom = readWatchlist(storage()?.getItem(WATCHLIST_KEY) ?? null);
    } catch {
      custom = null;
    }
  }
  return custom;
}

function save(next: string[] | null) {
  custom = next;
  try {
    if (next) storage()?.setItem(WATCHLIST_KEY, JSON.stringify(next));
    else storage()?.removeItem(WATCHLIST_KEY);
  } catch {
    // Storage blocked or full: the list still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WATCHLIST_KEY) return;
    custom = readWatchlist(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function defaultFor(senate: OddsView | null, house: OddsView | null) {
  const withHouse = Boolean(house && house.priced > 0);
  if (!frozenDefault || (withHouse && !frozenDefault.withHouse)) frozenDefault = { list: defaultWatchlist(senate, withHouse ? house : null), withHouse };
  return frozenDefault.list;
}

/** The viewer's watchlist, or the default; `custom` is false while it is the default. */
export function useWatchlist(senate: OddsView | null, house: OddsView | null) {
  const stored = useSyncExternalStore(subscribe, load, () => null);
  const list = stored ?? defaultFor(senate, house);
  return {
    list,
    custom: stored !== null,
    set: (next: string[]) => save(next),
    toggle: (code: string) => save(toggleWatch(list, code)),
    reset: () => save(null),
  };
}

export type Watchlist = ReturnType<typeof useWatchlist>;
