import type { HistoryPoint } from "@/features/election-monitor/marketHistory";

/**
 * Hourly Kalshi price traces. Hours with no stored price are left out of the history, never zero, so a trace is
 * drawn in segments and a gap stays a gap.
 */
export const HOUR_MS = 3_600_000;
/** Stored hours further apart than this mean the feed was down: break the line. */
export const GAP_MS = 1.5 * HOUR_MS;

export function traceSegments(points: HistoryPoint[], gapMs = GAP_MS): HistoryPoint[][] {
  const out: HistoryPoint[][] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous || point[0] - previous[0] > gapMs) out.push([point]);
    else out[out.length - 1].push(point);
  });
  return out;
}

/**
 * The change in points from the stored hour nearest `hours` before the last one (within three hours of it) to the
 * last one. Null when there is no such earlier hour, so a short history never reads as "no change".
 */
export function changeOver(points: HistoryPoint[], hours: number, toleranceHours = 3): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const target = last[0] - hours * HOUR_MS;
  let best: HistoryPoint | null = null;
  for (const point of points) {
    if (Math.abs(point[0] - target) > toleranceHours * HOUR_MS) continue;
    if (!best || Math.abs(point[0] - target) < Math.abs(best[0] - target)) best = point;
  }
  return best ? last[1] - best[1] : null;
}

/** "+3.1", "−2.0", "0.0". */
export function signedPoints(value: number) {
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}`;
}

/** A scale from `low` to `high` cents that holds every point, at least `minSpan` tall, in steps of 5. */
export function priceRange(series: HistoryPoint[][], minSpan = 20): [number, number] {
  const values = series.flat().map(([, value]) => value);
  if (values.length === 0) return [0, 100];
  let low = Math.floor(Math.min(...values) / 5) * 5;
  let high = Math.ceil(Math.max(...values) / 5) * 5;
  if (high - low < minSpan) {
    const middle = (low + high) / 2;
    low = Math.max(0, Math.floor((middle - minSpan / 2) / 5) * 5);
    high = Math.min(100, low + minSpan);
    low = high - minSpan;
  }
  return [Math.max(0, low), Math.min(100, high)];
}

/** SVG polyline `points` for each segment, in a `width` × `height` box. */
export function tracePolylines(points: HistoryPoint[], domain: [number, number], range: [number, number], width: number, height: number) {
  const [start, end] = domain;
  const [low, high] = range;
  const x = (t: number) => ((t - start) / (end - start || 1)) * width;
  const y = (value: number) => (1 - (value - low) / (high - low || 1)) * height;
  return traceSegments(points.filter(([t]) => t >= start && t <= end))
    .map((segment) => segment.map(([t, value]) => `${x(t).toFixed(1)},${y(value).toFixed(1)}`).join(" "));
}
