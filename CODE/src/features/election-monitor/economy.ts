import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { economyEnabled } from "@/lib/featureFlags";

export type IndicatorFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

/** `[YYYY-MM-DD, value]`. Missing periods are absent, never zero. */
export type IndicatorPoint = [string, number];

/** One FRED series from GET /api/indicators. */
export interface IndicatorSeries {
  key: string;
  fredId: string;
  name: string;
  unit: string;
  frequency: IndicatorFrequency;
  transform: "level" | "yoy" | "mom_change";
  originalSource: string;
  latest: { date: string; value: number; period: string } | null;
  /** Year-over-year percent for yoy series; otherwise the difference from the previous observation. */
  change: number | null;
  stale: boolean;
  fetchedAt: string | null;
  /** "BLS via FRED, fetched Oct 15". */
  sourceLine: string | null;
  history: IndicatorPoint[];
  changeHistory: IndicatorPoint[] | null;
}

export interface IndicatorsData {
  asOf: string;
  days: number;
  attribution: string;
  series: IndicatorSeries[];
}

/** FRED indicators, synced twice a day; the API caches for 15 minutes, so this does too. */
export function useEconIndicators(days = 730) {
  return useQuery<IndicatorsData, Error>({
    queryKey: ["election-monitor", "indicators", days],
    enabled: economyEnabled,
    staleTime: 15 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/indicators?days=${days}`, { signal });
      const body = await response.json().catch(() => ({}));
      // 404 NOT_LOADED before the first sync, or 404 with the backend flag off: the strip stays hidden.
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body.data as IndicatorsData;
    },
  });
}

/** Changes are shown in neutral colours: whether a rise is good depends on who is asked. */
export type ChangeDirection = "up" | "down" | "flat";

export interface EconTile {
  id: string;
  label: string;
  /** Formatted headline, or "Not available". */
  value: string;
  missing: boolean;
  change: { text: string; direction: ChangeDirection; basis: string } | null;
  period: string | null;
  stale: boolean;
  /** Tooltip lines: what the tile shows, related series, and where it comes from. */
  details: string[];
  spark: { points: Array<[number, number]>; frequency: IndicatorFrequency; label: string } | null;
}

const MINUS = "−";

const signed = (value: number, digits: number, suffix = "", prefix = "") => {
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
  return `${sign}${prefix}${Math.abs(rounded).toFixed(digits)}${suffix}`;
};

export const fmt = {
  percent: (value: number, digits = 1) => `${value < 0 ? MINUS : ""}${Math.abs(value).toFixed(digits)}%`,
  dollars: (value: number) => `$${value.toFixed(2)}`,
  /** 199000 → "199K"; payrolls are already in thousands, so pass `alreadyThousands`. */
  thousands: (value: number, alreadyThousands = false) => {
    const k = alreadyThousands ? value : value / 1000;
    return `${k < 0 ? MINUS : ""}${Math.abs(Math.round(k)).toLocaleString("en-US")}K`;
  },
  signedPercent: (value: number, digits = 1) => signed(value, digits, "%"),
  points: (value: number, digits = 1) => signed(value, digits, " pts"),
  signedDollars: (value: number) => signed(value, 2, "", "$"),
  signedThousands: (value: number, alreadyThousands = false) => {
    const k = Math.round(alreadyThousands ? value : value / 1000);
    return `${k > 0 ? "+" : k < 0 ? MINUS : ""}${Math.abs(k).toLocaleString("en-US")}K`;
  },
};

/** Read from the formatted text, so the arrow always agrees with the rounded number shown. */
const directionOf = (text: string): ChangeDirection => (text.startsWith("+") ? "up" : text.startsWith(MINUS) ? "down" : "flat");

const PRIOR: Record<IndicatorFrequency, string> = {
  DAILY: "vs. prior day",
  WEEKLY: "vs. prior week",
  MONTHLY: "vs. prior month",
  QUARTERLY: "vs. prior quarter",
};

const toEpoch = (date: string) => Date.parse(`${date}T00:00:00Z`);
const points = (rows: IndicatorPoint[] | null | undefined) => (rows ?? []).map(([date, value]): [number, number] => [toEpoch(date), value]);
const lastTwo = (rows: IndicatorPoint[] | null | undefined) => (rows && rows.length >= 2 ? [rows[rows.length - 2][1], rows[rows.length - 1][1]] : null);

interface TileSpec {
  id: string;
  label: string;
  main: string;
  /** "level" shows the latest value; "change" shows the series' change (year-over-year or jobs added). */
  show: "level" | "change";
  format: (value: number) => string;
  basis?: string;
  /** How the tile's own change is written; omit for no change chip. */
  changeFormat?: (value: number) => string;
  extras?: (bySeries: Map<string, IndicatorSeries>) => string[];
  /** Replaces the plain period label. */
  period?: (series: IndicatorSeries) => string;
}

const latestOf = (bySeries: Map<string, IndicatorSeries>, fredId: string) => bySeries.get(fredId)?.latest?.value ?? null;
const yoyOf = (bySeries: Map<string, IndicatorSeries>, fredId: string) => bySeries.get(fredId)?.change ?? null;

const TILE_SPECS: TileSpec[] = [
  { id: "gdp", label: "GDP growth", main: "A191RL1Q225SBEA", show: "level", format: (v) => fmt.percent(v), basis: "annualized", changeFormat: (v) => fmt.points(v) },
  {
    id: "gdpnow", label: "GDPNow", main: "GDPNOW", show: "level", format: (v) => fmt.percent(v), basis: "annualized",
    // FRED dates the estimate to the start of the quarter it covers.
    period: (series) => `Atlanta Fed estimate for ${series.latest?.period.split(" ")[0] ?? "this quarter"}`,
    extras: () => ["A running model estimate of this quarter's growth, not an official figure."],
  },
  {
    id: "oil", label: "Oil (WTI)", main: "DCOILWTICO", show: "level", format: fmt.dollars, basis: "per barrel", changeFormat: fmt.signedDollars,
    extras: (by) => (latestOf(by, "DCOILBRENTEU") === null ? [] : [`Brent: ${fmt.dollars(latestOf(by, "DCOILBRENTEU")!)} per barrel`]),
  },
  { id: "gas", label: "Gas", main: "GASREGW", show: "level", format: fmt.dollars, basis: "per gallon, regular", changeFormat: (v) => fmt.signedPercent(v) },
  {
    id: "inflation", label: "Inflation (CPI)", main: "CPIAUCSL", show: "change", format: (v) => fmt.percent(v), basis: "vs. a year ago", changeFormat: (v) => fmt.points(v),
    extras: (by) => (yoyOf(by, "CPILFESL") === null ? [] : [`Core CPI (less food and energy): ${fmt.percent(yoyOf(by, "CPILFESL")!)} vs. a year ago`]),
  },
  { id: "unemployment", label: "Unemployment", main: "UNRATE", show: "level", format: (v) => fmt.percent(v), changeFormat: (v) => fmt.points(v) },
  { id: "jobs", label: "Jobs added", main: "PAYEMS", show: "change", format: (v) => fmt.signedThousands(v, true), basis: "nonfarm payrolls" },
  { id: "claims", label: "Jobless claims", main: "ICSA", show: "level", format: (v) => fmt.thousands(v), basis: "initial, weekly", changeFormat: (v) => fmt.signedThousands(v) },
  { id: "fed", label: "Fed rate", main: "DFEDTARU", show: "level", format: (v) => fmt.percent(v, 2), basis: "target range" },
  { id: "mortgage", label: "Mortgage rate", main: "MORTGAGE30US", show: "level", format: (v) => fmt.percent(v, 2), basis: "30-year fixed", changeFormat: (v) => fmt.points(v, 2) },
  {
    id: "treasury", label: "10-yr Treasury", main: "DGS10", show: "level", format: (v) => fmt.percent(v, 2), changeFormat: (v) => fmt.points(v, 2),
    extras: (by) => [
      ...(latestOf(by, "DGS2") === null ? [] : [`2-year yield: ${fmt.percent(latestOf(by, "DGS2")!, 2)}`]),
      ...(latestOf(by, "T10Y2Y") === null ? [] : [`10-year minus 2-year: ${fmt.points(latestOf(by, "T10Y2Y")!, 2)}`]),
    ],
  },
  { id: "income", label: "Real income", main: "A229RX0", show: "change", format: (v) => fmt.signedPercent(v), basis: "per person, vs. a year ago", changeFormat: (v) => fmt.points(v) },
  { id: "sentiment", label: "Consumer sentiment", main: "UMCSENT", show: "level", format: (v) => v.toFixed(1), basis: "Univ. of Michigan index", changeFormat: (v) => signed(v, 1) },
];

/** Builds the strip's tiles; a tile whose series is missing says "Not available". */
export function buildTiles(data: IndicatorsData): EconTile[] {
  const bySeries = new Map(data.series.map((series) => [series.fredId, series]));
  return TILE_SPECS.map((spec) => {
    const series = bySeries.get(spec.main);
    const shownValue = spec.show === "level" ? series?.latest?.value ?? null : series?.change ?? null;
    const missing = !series?.latest || shownValue === null;
    const shownHistory = spec.show === "level" ? series?.history : series?.changeHistory;

    let value = missing ? "Not available" : spec.format(shownValue!);
    if (spec.id === "fed" && !missing) {
      const lower = latestOf(bySeries, "DFEDTARL");
      value = lower === null ? value : `${lower.toFixed(2)}–${fmt.percent(shownValue!, 2)}`;
    }

    // A "change" tile's chip compares its last two shown values; a "level" tile uses the series' change.
    let change: EconTile["change"] = null;
    if (!missing && spec.changeFormat) {
      const pair = lastTwo(shownHistory);
      const delta = spec.show === "change" ? pair && pair[1] - pair[0] : series!.change;
      if (delta !== null) {
        const text = spec.changeFormat(delta);
        const basis = spec.show === "level" && series!.transform === "yoy" ? "vs. a year ago" : PRIOR[series!.frequency];
        change = { text, direction: directionOf(text), basis };
      }
    }

    const sparkPoints = points(shownHistory);
    const details = series
      ? [
        `${series.name}${spec.basis ? `, ${spec.basis}` : ""}`,
        ...(spec.extras?.(bySeries) ?? []),
        series.sourceLine ?? `${series.originalSource} via FRED`,
      ]
      : ["Not available from FRED yet."];

    return {
      id: spec.id,
      label: spec.label,
      value,
      missing,
      change,
      period: series?.latest ? spec.period?.(series) ?? series.latest.period : null,
      stale: Boolean(series?.stale && !missing),
      details,
      spark: sparkPoints.length >= 2 && series ? { points: sparkPoints, frequency: series.frequency, label: `${spec.label}, past ${Math.round(data.days / 365)} years` } : null,
    };
  });
}
