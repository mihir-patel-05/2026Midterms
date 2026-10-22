import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
  transform: "level" | "yoy" | "mom_change" | "qoq_annualized";
  originalSource: string;
  /** Postal code for a state series; null for a national one. */
  stateCode: string | null;
  latest: { date: string; value: number; period: string } | null;
  /**
   * Year-over-year percent for yoy series, annualized percent from the prior
   * quarter for qoq_annualized; otherwise the difference from the previous observation.
   */
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
  /** Present when a state was asked for; `supported` is false when FRED has no series for it. */
  state?: { code: string; supported: boolean; series: IndicatorSeries[] } | null;
}

/**
 * FRED indicators, synced twice a day; the API caches for 15 minutes, so this does too.
 * With `stateCode`, the response also carries that state's series.
 */
export function useEconIndicators(days = 730, stateCode: string | null = null) {
  return useQuery<IndicatorsData, Error>({
    queryKey: ["election-monitor", "indicators", days, stateCode],
    enabled: economyEnabled,
    staleTime: 15 * 60_000,
    retry: 1,
    // Keep the current tiles up while another state's figures load.
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const query = new URLSearchParams({ days: String(days) });
      if (stateCode) query.set("state", stateCode);
      const response = await fetch(`${API_BASE_URL}/api/indicators?${query.toString()}`, { signal });
      const body = await response.json().catch(() => ({}));
      // 404 NOT_LOADED before the first sync, or 404 with the backend flag off: the strip stays hidden.
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      return body.data as IndicatorsData;
    },
  });
}

/** Changes are shown in neutral colours: whether a rise is good depends on who is asked. */
export type ChangeDirection = "up" | "down" | "flat";

export type CompareMode = "overlay" | "stacked";

export interface ChartSeries {
  points: Array<[number, number]>;
  frequency: IndicatorFrequency;
  /** What the plotted values are, e.g. "Percent" or "Percent change from a year earlier". */
  unit: string;
  format: (value: number) => string;
  /** "BLS via FRED, fetched Oct 15". */
  source: string;
}

export interface EconTile {
  id: string;
  label: string;
  /** "state" when the tile shows the selected state's series. */
  scope: "national" | "state";
  /** Formatted headline, or "Not available". */
  value: string;
  missing: boolean;
  change: { text: string; direction: ChangeDirection; basis: string } | null;
  period: string | null;
  stale: boolean;
  /** Tooltip lines: what the tile shows, related series, and where it comes from. */
  details: string[];
  spark: { points: Array<[number, number]>; frequency: IndicatorFrequency; label: string } | null;
  /** Everything the history dialog plots; null when the series is missing. */
  chart: ChartSeries | null;
  /** For a state tile, the U.S. series it is compared with, and how. */
  comparison: (ChartSeries & { mode: CompareMode }) | null;
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
  /** One decimal under 10K, so a small state's change reads "+0.4K" rather than "+0K". */
  signedThousands: (value: number, alreadyThousands = false) => {
    const k = alreadyThousands ? value : value / 1000;
    const digits = Math.abs(k) < 9.95 ? 1 : 0;
    const rounded = Number(k.toFixed(digits));
    return `${rounded > 0 ? "+" : rounded < 0 ? MINUS : ""}${Math.abs(rounded).toLocaleString("en-US", { minimumFractionDigits: digits })}K`;
  },
  /** Claims: the plain number under 1,000, one decimal under 10K, then whole thousands. */
  count: (value: number) => {
    if (Math.abs(value) < 999.5) return `${value < 0 ? MINUS : ""}${Math.abs(Math.round(value))}`;
    if (Math.abs(value) < 9_950) return `${value < 0 ? MINUS : ""}${(Math.abs(value) / 1000).toFixed(1)}K`;
    return fmt.thousands(value);
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

/** How one series is shown on a tile. */
interface SeriesView {
  /** "level" shows the latest value; "change" shows the series' change (year-over-year, jobs added, or growth). */
  show: "level" | "change";
  format: (value: number) => string;
  basis?: string;
  /** How the tile's own change is written; omit for no change chip. */
  changeFormat?: (value: number) => string;
}

/** The state series' FRED ID suffixes: CAUR, CANA, CAICLAIMS, CARQGSP, CASTHPI. */
export type StateSuffix = "UR" | "NA" | "ICLAIMS" | "RQGSP" | "STHPI";

interface TileSpec extends SeriesView {
  id: string;
  label: string;
  main: string;
  extras?: (bySeries: Map<string, IndicatorSeries>) => string[];
  /** Replaces the plain period label. */
  period?: (series: IndicatorSeries) => string;
  /**
   * The tile's state version. Tiles without one are U.S.-only and hidden while a
   * state is selected. `compare` says how the dialog sets the state against the
   * U.S.: one shared axis, or two charts when their sizes are not comparable.
   */
  state?: SeriesView & { suffix: StateSuffix; compare: CompareMode };
}

const latestOf = (bySeries: Map<string, IndicatorSeries>, fredId: string) => bySeries.get(fredId)?.latest?.value ?? null;
const yoyOf = (bySeries: Map<string, IndicatorSeries>, fredId: string) => bySeries.get(fredId)?.change ?? null;

const TILE_SPECS: TileSpec[] = [
  {
    id: "gdp", label: "GDP growth", main: "A191RL1Q225SBEA", show: "level", format: (v) => fmt.percent(v), basis: "annualized", changeFormat: (v) => fmt.points(v),
    state: { suffix: "RQGSP", show: "change", format: (v) => fmt.percent(v), basis: "real, annualized", changeFormat: (v) => fmt.points(v), compare: "overlay" },
  },
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
  {
    id: "unemployment", label: "Unemployment", main: "UNRATE", show: "level", format: (v) => fmt.percent(v), changeFormat: (v) => fmt.points(v),
    state: { suffix: "UR", show: "level", format: (v) => fmt.percent(v), changeFormat: (v) => fmt.points(v), compare: "overlay" },
  },
  {
    id: "jobs", label: "Jobs added", main: "PAYEMS", show: "change", format: (v) => fmt.signedThousands(v, true), basis: "nonfarm payrolls",
    state: { suffix: "NA", show: "change", format: (v) => fmt.signedThousands(v, true), basis: "nonfarm payrolls", compare: "stacked" },
  },
  {
    id: "claims", label: "Jobless claims", main: "ICSA", show: "level", format: (v) => fmt.thousands(v), basis: "initial, weekly", changeFormat: (v) => fmt.signedThousands(v),
    state: { suffix: "ICLAIMS", show: "level", format: fmt.count, basis: "initial, weekly, not seasonally adjusted", changeFormat: (v) => fmt.signedThousands(v), compare: "stacked" },
  },
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
  {
    id: "homes", label: "Home prices", main: "USSTHPI", show: "change", format: (v) => fmt.signedPercent(v), basis: "FHFA index, vs. a year ago", changeFormat: (v) => fmt.points(v),
    state: { suffix: "STHPI", show: "change", format: (v) => fmt.signedPercent(v), basis: "FHFA index, vs. a year ago", changeFormat: (v) => fmt.points(v), compare: "overlay" },
  },
];

/** The values a tile shows for a series: its levels, or its changes. */
const shownValue = (series: IndicatorSeries | undefined, view: SeriesView) => (view.show === "level" ? series?.latest?.value ?? null : series?.change ?? null);
const shownHistory = (series: IndicatorSeries | undefined, view: SeriesView) => (view.show === "level" ? series?.history : series?.changeHistory);

const CHANGE_UNIT: Record<IndicatorSeries["transform"], (series: IndicatorSeries) => string> = {
  level: () => "Change from the previous observation",
  yoy: () => "Percent change from a year earlier",
  mom_change: (series) => `Change from prior month, ${series.unit.toLowerCase()}`,
  qoq_annualized: () => "Percent change from prior quarter, annualized",
};

function chartOf(series: IndicatorSeries | undefined, view: SeriesView): ChartSeries | null {
  const rows = points(shownHistory(series, view));
  if (!series || rows.length === 0) return null;
  return {
    points: rows,
    frequency: series.frequency,
    unit: view.show === "level" ? series.unit : CHANGE_UNIT[series.transform](series),
    format: view.format,
    source: series.sourceLine ?? `${series.originalSource} via FRED`,
  };
}


interface TileInput {
  spec: TileSpec;
  view: SeriesView;
  series: IndicatorSeries | undefined;
  /** National series by FRED ID, for the Fed range and the tooltip extras. */
  national: Map<string, IndicatorSeries>;
  days: number;
  scope: EconTile["scope"];
  /** Tooltip lines placed before the source, e.g. the U.S. comparison. */
  extras: string[];
  comparison: EconTile["comparison"];
}

function buildTile({ spec, view, series, national, days, scope, extras, comparison }: TileInput): EconTile {
  const shown = shownValue(series, view);
  const missing = !series?.latest || shown === null;
  const history = shownHistory(series, view);

  let value = missing ? "Not available" : view.format(shown!);
  if (spec.id === "fed" && !missing) {
    const lower = latestOf(national, "DFEDTARL");
    value = lower === null ? value : `${lower.toFixed(2)}–${fmt.percent(shown!, 2)}`;
  }

  // A "change" tile's chip compares its last two shown values; a "level" tile uses the series' change.
  let change: EconTile["change"] = null;
  if (!missing && view.changeFormat) {
    const pair = lastTwo(history);
    const delta = view.show === "change" ? pair && pair[1] - pair[0] : series!.change;
    if (delta !== null) {
      const text = view.changeFormat(delta);
      const basis = view.show === "level" && series!.transform === "yoy" ? "vs. a year ago" : PRIOR[series!.frequency];
      change = { text, direction: directionOf(text), basis };
    }
  }

  const sparkPoints = points(history);
  const details = series
    ? [`${series.name}${view.basis ? `, ${view.basis}` : ""}`, ...extras, series.sourceLine ?? `${series.originalSource} via FRED`]
    : ["Not available from FRED yet."];

  return {
    id: spec.id,
    label: spec.label,
    scope,
    value,
    missing,
    change,
    period: series?.latest ? spec.period?.(series) ?? series.latest.period : null,
    stale: Boolean(series?.stale && !missing),
    details,
    spark: sparkPoints.length >= 2 && series ? { points: sparkPoints, frequency: series.frequency, label: `${spec.label}, past ${Math.round(days / 365)} years` } : null,
    chart: missing ? null : chartOf(series, view),
    comparison: missing ? null : comparison,
  };
}

/**
 * Builds the strip's tiles; a tile whose series is missing says "Not available".
 * When the response carries a supported state, only tiles with a state version
 * are built, from the state's series, each with its U.S. counterpart.
 */
export function buildTiles(data: IndicatorsData): EconTile[] {
  const national = new Map(data.series.map((series) => [series.fredId, series]));
  const state = data.state?.supported ? data.state : null;

  if (!state) {
    return TILE_SPECS.map((spec) => buildTile({
      spec, view: spec, series: national.get(spec.main), national, days: data.days, scope: "national", extras: spec.extras?.(national) ?? [], comparison: null,
    }));
  }

  const bySuffix = new Map(state.series.map((series) => [series.fredId.slice(state.code.length), series]));
  return TILE_SPECS.flatMap((spec) => {
    if (!spec.state) return [];
    const us = national.get(spec.main);
    const usValue = shownValue(us, spec);
    const usChart = chartOf(us, spec);
    return [buildTile({
      spec,
      view: spec.state,
      series: bySuffix.get(spec.state.suffix),
      national,
      days: data.days,
      scope: "state",
      extras: usValue === null ? [] : [`U.S.: ${spec.format(usValue)}${us?.latest ? `, ${us.latest.period}` : ""}`],
      comparison: usChart && { ...usChart, mode: spec.state.compare },
    })];
  });
}
