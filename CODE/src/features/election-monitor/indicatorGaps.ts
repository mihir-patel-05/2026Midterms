import type { IndicatorFrequency } from "./economy";

const DAY_MS = 86_400_000;

/**
 * Points further apart than this are a missing period (a delayed release, a
 * government shutdown): draw a gap. Daily series arrive reduced to one value a week.
 */
export const GAP_MS: Record<IndicatorFrequency, number> = { DAILY: 12 * DAY_MS, WEEKLY: 12 * DAY_MS, MONTHLY: 40 * DAY_MS, QUARTERLY: 100 * DAY_MS };

/** Split `[epoch ms, value]` points into runs with no missing period inside. */
export function segments(points: Array<[number, number]>, frequency: IndicatorFrequency) {
  const out: Array<Array<[number, number]>> = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous || point[0] - previous[0] > GAP_MS[frequency]) out.push([point]);
    else out[out.length - 1].push(point);
  });
  return out;
}

/** The same points with a null halfway across each missing period, so a chart line breaks there. */
export function withGaps(points: Array<[number, number]>, frequency: IndicatorFrequency): Array<[number, number | null]> {
  const out: Array<[number, number | null]> = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && point[0] - previous[0] > GAP_MS[frequency]) out.push([Math.round((previous[0] + point[0]) / 2), null]);
    out.push(point);
  });
  return out;
}
