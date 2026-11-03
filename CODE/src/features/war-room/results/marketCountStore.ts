import { useSyncExternalStore } from "react";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import type { LiveBoard } from "./liveResults";
import { advanceMarketCount, emptyMarketCount, type MarketAlert, type MarketCountState } from "./marketCount";

/**
 * One market vs count tracker per browser tab. The shell feeds it the latest results board and Kalshi prices every
 * few seconds; the panel and the alerts read from it. Nothing is stored: a reload starts a fresh price history.
 */

const ALERTS_KEPT = 6;

interface Snapshot {
  state: MarketCountState;
  /** Alerts not yet dismissed, newest first. */
  alerts: MarketAlert[];
}

let snapshot: Snapshot = { state: emptyMarketCount(), alerts: [] };
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function observeMarkets(input: { board: LiveBoard | null; markets: ReadonlyMap<string, KalshiMarket>; byRace: Map<string, KalshiMarket[]>; watched: readonly string[]; now?: number }) {
  const now = input.now ?? Date.now();
  const before = snapshot.state.testData;
  const { state, fresh } = advanceMarketCount(snapshot.state, { ...input, now });
  // A switch between test data and live numbers drops old alerts, so test alerts never linger into the real night.
  const kept = before !== null && state.testData !== before ? [] : snapshot.alerts;
  emit({ state, alerts: [...fresh, ...kept].slice(0, ALERTS_KEPT) });
}

export function dismissMarketAlert(key?: string) {
  emit({ ...snapshot, alerts: key ? snapshot.alerts.filter((alert) => alert.key !== key) : [] });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMarketCount() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export const marketCountSnapshot = () => snapshot;

/** For tests. */
export function resetMarketCount() {
  snapshot = { state: emptyMarketCount(), alerts: [] };
}
