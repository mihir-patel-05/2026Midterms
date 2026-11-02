import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMargin, type StateOutcome } from "./model";
import { outcomeWords, resultLabel } from "./labels";
import type { SeatOutcome } from "./midterms/model";
import { parseHouse, parseSenate, writeHouse } from "./midterms/useMidtermParams";
import { parseScenario, writeCountyScenario, writeScenario } from "./useSimulatorParams";

/**
 * A saved forecast: the scenario a viewer built in a simulator (state calls and margins, swings, county edits,
 * House seats), kept in this browser so it opens again next time. One per simulator. Like the War Room
 * watchlist, it lives in localStorage: no account, nothing sent to the server, and every read and write is
 * wrapped so a blocked or full storage only means the forecast isn't kept.
 */
export type ForecastKind = "midterms" | "electoral";

const STORAGE_KEYS: Record<ForecastKind, string> = {
  midterms: "simulator.forecast.midterms.v1",
  electoral: "simulator.forecast.electoral.v1",
};

/** URL keys that make up each scenario. Everything else (the open state, layer, chamber) is the view, never saved. */
export const SCENARIO_KEYS: Record<ForecastKind, readonly string[]> = {
  electoral: ["base", "swing", "ss", "c", "p", "d"],
  midterms: ["base", "swing", "ss", "c", "p", "h", "hbase", "hswing"],
};

export interface SavedForecast {
  kind: ForecastKind;
  /** The scenario as a query string, normalised: "" is the default map. */
  scenario: string;
  /** ISO time it was saved. */
  savedAt: string;
}

/**
 * The scenario part of a URL, read and written back through the simulator's own parsers, so unknown codes,
 * out-of-range swings and view settings are dropped, defaults are left out, and two equal scenarios compare equal.
 */
export function scenarioSearch(kind: ForecastKind, search: URLSearchParams) {
  const out = new URLSearchParams();
  if (kind === "electoral") writeScenario(out, parseScenario(search).scenario);
  else {
    writeCountyScenario(out, parseSenate(search).scenario);
    writeHouse(out, parseHouse(search));
  }
  out.sort();
  return out.toString();
}

/** `current` with its scenario replaced by `scenario`, keeping the view (open state, layer, chamber). */
export function applyScenario(kind: ForecastKind, current: URLSearchParams, scenario: string) {
  const next = new URLSearchParams(current);
  for (const key of SCENARIO_KEYS[kind]) next.delete(key);
  for (const [key, value] of new URLSearchParams(scenario)) if (SCENARIO_KEYS[kind].includes(key)) next.set(key, value);
  return next;
}

/** Storage that can throw (blocked, private windows) or be absent (tests, server rendering). */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSavedForecast(kind: ForecastKind, store: Store | null = defaultStore()): SavedForecast | null {
  try {
    const raw = store?.getItem(STORAGE_KEYS[kind]);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedForecast> | null;
    if (!value || typeof value.scenario !== "string" || typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
    // Normalised again on the way in, so a code dropped from the race list since it was saved can't break the map.
    return { kind, scenario: scenarioSearch(kind, new URLSearchParams(value.scenario)), savedAt: value.savedAt };
  } catch {
    return null;
  }
}

/** Saves `scenario`; returns what was saved, or null when the browser wouldn't keep it. */
export function writeSavedForecast(kind: ForecastKind, scenario: string, now = new Date(), store: Store | null = defaultStore()): SavedForecast | null {
  const saved: SavedForecast = { kind, scenario: scenarioSearch(kind, new URLSearchParams(scenario)), savedAt: now.toISOString() };
  try {
    if (!store) return null;
    store.setItem(STORAGE_KEYS[kind], JSON.stringify({ scenario: saved.scenario, savedAt: saved.savedAt }));
    return saved;
  } catch {
    return null;
  }
}

export function clearSavedForecast(kind: ForecastKind, store: Store | null = defaultStore()) {
  try {
    store?.removeItem(STORAGE_KEYS[kind]);
  } catch {
    // Nothing kept, nothing to clear.
  }
}

/** The saved forecast, kept in step with other tabs. Read-only: for pages that show it outside the simulator. */
export function useStoredForecast(kind: ForecastKind) {
  const [saved, setSaved] = useState(() => readSavedForecast(kind));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEYS[kind]) setSaved(readSavedForecast(kind));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [kind]);
  return [saved, setSaved] as const;
}

export type ForecastStatus = "none" | "saved" | "changed";

/**
 * Save, open, and clear a simulator's forecast. When the simulator opens with no scenario in its URL (a plain
 * visit, or a "Simulate this" link that only names a state), the saved forecast is put back into the URL once,
 * so it is on screen straight away. A link that carries its own scenario wins; the saved one is a click away.
 */
export function useSavedForecast(kind: ForecastKind) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [saved, setSaved] = useStoredForecast(kind);
  const [restored, setRestored] = useState<SavedForecast | null>(null);
  const current = useMemo(() => scenarioSearch(kind, searchParams), [kind, searchParams]);

  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (current !== "" || !saved || saved.scenario === "") return;
    setSearchParams((previous) => applyScenario(kind, previous, saved.scenario), { replace: true });
    setRestored(saved);
    // Only on open: later changes to the URL are the viewer's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => {
    const next = writeSavedForecast(kind, current);
    if (next) setSaved(next);
    return next;
  }, [kind, current, setSaved]);

  const open = useCallback(() => {
    if (!saved) return;
    setSearchParams((previous) => applyScenario(kind, previous, saved.scenario), { replace: true });
    setRestored(saved);
  }, [kind, saved, setSearchParams]);

  const clear = useCallback(() => {
    clearSavedForecast(kind);
    setSaved(null);
    setRestored(null);
  }, [kind, setSaved]);

  const status: ForecastStatus = !saved ? "none" : saved.scenario === current ? "saved" : "changed";
  return { saved, status, restored, empty: current === "", save, open, clear, dismissRestored: () => setRestored(null) };
}

/** "Nov 2, 3:14 PM" in the viewer's own time zone: when they saved it, as they'd remember it. */
export function savedAtLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** One Senate race in a forecast: its result and where it came from, as the simulator's own table words it. */
export function senateForecastLine(state: StateOutcome, base: number | null, swung: boolean) {
  const from = state.source === "pick" ? "your call"
    : state.source === "counties" ? "from your county settings"
    : state.source === "baseline" ? `${base} presidential vote${swung ? " with your swings" : ""}`
    : "not set";
  return { winner: state.winner, result: resultLabel(state), from };
}

/** One House seat in a forecast. */
export function houseForecastLine(seat: SeatOutcome, base: number | null, swing: number) {
  const result = seat.winner === "T" ? "Tossup" : seat.source === "pick" || seat.margin === null ? outcomeWords[seat.winner] : formatMargin(seat.margin);
  const from = seat.source === "pick" ? "your call"
    : seat.source === "swing" ? `${base} result flipped by your House swing`
    : seat.source === "baseline" ? (seat.unopposed ? `unopposed in ${base}` : `${base} result${swing ? " with your House swing" : ""}`)
    : "not set";
  return { winner: seat.winner, result, from };
}
