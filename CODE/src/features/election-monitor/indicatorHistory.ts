import type { IndicatorFrequency } from "./economy";
import { withGaps } from "./indicatorGaps";

export type HistoryRange = "1Y" | "2Y" | "5Y";
export const HISTORY_RANGES: Array<{ value: HistoryRange; label: string; years: number }> = [
  { value: "1Y", label: "1 year", years: 1 },
  { value: "2Y", label: "2 years", years: 2 },
  { value: "5Y", label: "5 years", years: 5 },
];

/** Points from `years` before `asOf` (epoch ms) on. */
export function inRange(points: Array<[number, number]>, asOf: number, range: HistoryRange): Array<[number, number]> {
  const cutoff = new Date(asOf);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - HISTORY_RANGES.find((item) => item.value === range)!.years);
  return points.filter(([t]) => t >= cutoff.getTime());
}

/** One chart row; a null value breaks that line. */
export interface HistoryRow {
  t: number;
  main?: number | null;
  us?: number | null;
}

/** Rows for recharts: each series gets nulls at its own gaps, then the two are joined on date. */
export function historyRows(
  main: { points: Array<[number, number]>; frequency: IndicatorFrequency },
  us: { points: Array<[number, number]>; frequency: IndicatorFrequency } | null = null,
): HistoryRow[] {
  const rows = new Map<number, HistoryRow>();
  const add = (key: "main" | "us", points: Array<[number, number | null]>) => {
    for (const [t, value] of points) rows.set(t, { ...rows.get(t), t, [key]: value });
  };
  add("main", withGaps(main.points, main.frequency));
  if (us) add("us", withGaps(us.points, us.frequency));
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The period a point covers, as the API labels it: "Sep 2026", "Q2 2026", "Week ending Oct 10, 2026". */
export function periodText(t: number, frequency: IndicatorFrequency): string {
  const day = new Date(t);
  const month = MONTHS[day.getUTCMonth()];
  const year = day.getUTCFullYear();
  switch (frequency) {
    case "DAILY": return `${month} ${day.getUTCDate()}, ${year}`;
    case "WEEKLY": return `Week ending ${month} ${day.getUTCDate()}, ${year}`;
    case "MONTHLY": return `${month} ${year}`;
    case "QUARTERLY": return `Q${Math.floor(day.getUTCMonth() / 3) + 1} ${year}`;
  }
}

/** Axis ticks: "Jan ’25". */
export function axisDate(t: number): string {
  const day = new Date(t);
  return `${MONTHS[day.getUTCMonth()]} ’${String(day.getUTCFullYear()).slice(2)}`;
}
