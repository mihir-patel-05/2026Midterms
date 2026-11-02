import { useSyncExternalStore } from "react";
import { advanceCalls, type CallTrackerState, type SeenCall } from "./nightExtras";
import type { LiveBoard } from "./liveResults";

/**
 * One tracker per browser tab for the War Room's call log and watchlist alerts. The shell feeds it each new results
 * board; screens read retractions and alerts from it. Nothing is stored: a reload starts from the board it loads.
 */

export interface CallAlert extends SeenCall {
  seenAt: number;
}

interface Snapshot {
  tracker: CallTrackerState | null;
  /** Watchlist calls not yet dismissed, newest first. */
  alerts: CallAlert[];
}

const ALERTS_KEPT = 6;
let snapshot: Snapshot = { tracker: null, alerts: [] };
let lastBoard: LiveBoard | null = null;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Folds in a board (once per board), and raises alerts for fresh calls in `watched`. */
export function observeBoard(board: LiveBoard, watched: readonly string[], now = Date.now()) {
  if (board === lastBoard) return;
  lastBoard = board;
  const tracker = advanceCalls(snapshot.tracker, board, now);
  const fresh = tracker.fresh.filter((call) => watched.includes(call.code)).map((call) => ({ ...call, seenAt: now }));
  // A switch between test data and live numbers starts over, so test alerts never linger into the real night.
  const kept = snapshot.tracker && snapshot.tracker.testData !== tracker.testData ? [] : snapshot.alerts;
  emit({ tracker, alerts: [...fresh, ...kept].slice(0, ALERTS_KEPT) });
}

export function dismissAlert(key?: string) {
  emit({ ...snapshot, alerts: key ? snapshot.alerts.filter((alert) => alert.key !== key) : [] });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCallTracker() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export const callTrackerSnapshot = () => snapshot;

/** For tests. */
export function resetCallTracker() {
  snapshot = { tracker: null, alerts: [] };
  lastBoard = null;
}
