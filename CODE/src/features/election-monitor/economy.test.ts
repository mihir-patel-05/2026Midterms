import { describe, expect, it } from "vitest";
import { buildTiles, fmt, type IndicatorSeries, type IndicatorsData } from "./economy";

const series = (fredId: string, patch: Partial<IndicatorSeries>): IndicatorSeries => ({
  key: `fred.${fredId}`,
  fredId,
  name: fredId,
  unit: "Percent",
  frequency: "MONTHLY",
  transform: "level",
  originalSource: "BLS",
  stateCode: null,
  latest: null,
  change: null,
  stale: false,
  fetchedAt: "2026-10-15T13:20:00Z",
  sourceLine: "BLS via FRED, fetched Oct 15",
  history: [],
  changeHistory: null,
  ...patch,
});

const data = (list: IndicatorSeries[], state: IndicatorsData["state"] = null): IndicatorsData => ({ asOf: "2026-10-15T14:00:00Z", days: 730, attribution: "", series: list, state });
const tile = (list: IndicatorSeries[], id: string) => buildTiles(data(list)).find((item) => item.id === id)!;

describe("number formats", () => {
  it("uses a real minus sign and rounds before choosing a sign", () => {
    expect(fmt.percent(-0.25)).toBe("−0.3%");
    expect(fmt.points(-0.02, 2)).toBe("−0.02 pts");
    expect(fmt.points(0.04)).toBe("0.0 pts");
    expect(fmt.signedPercent(41.49)).toBe("+41.5%");
    expect(fmt.signedDollars(1.05)).toBe("+$1.05");
    expect(fmt.thousands(199_000)).toBe("199K");
    expect(fmt.signedThousands(29, true)).toBe("+29K");
    expect(fmt.signedThousands(-1_400)).toBe("−1.4K");
  });

  it("keeps small state counts readable", () => {
    expect(fmt.signedThousands(0.4, true)).toBe("+0.4K");
    expect(fmt.signedThousands(-0.04, true)).toBe("0.0K");
    expect(fmt.signedThousands(9.96, true)).toBe("+10K");
    expect(fmt.signedThousands(-312)).toBe("−0.3K");
    expect(fmt.signedThousands(12_400)).toBe("+12K");
    expect(fmt.count(812)).toBe("812");
    expect(fmt.count(999.6)).toBe("1.0K");
    expect(fmt.count(4_380)).toBe("4.4K");
    expect(fmt.count(41_200)).toBe("41K");
  });
});

describe("economy tiles", () => {
  it("shows inflation as the change from a year ago, with the month-to-month move in that rate", () => {
    const cpi = series("CPIAUCSL", {
      transform: "yoy",
      latest: { date: "2026-09-01", value: 336.3, period: "Sep 2026" },
      change: 3.72,
      changeHistory: [["2026-08-01", 3.5], ["2026-09-01", 3.72]],
    });
    const core = series("CPILFESL", { transform: "yoy", latest: { date: "2026-09-01", value: 338.9, period: "Sep 2026" }, change: 2.57 });
    const inflation = tile([cpi, core], "inflation");
    expect(inflation.value).toBe("3.7%");
    expect(inflation.change).toEqual({ text: "+0.2 pts", direction: "up", basis: "vs. prior month" });
    expect(inflation.details).toContain("Core CPI (less food and energy): 2.6% vs. a year ago");
    expect(inflation.details.at(-1)).toBe("BLS via FRED, fetched Oct 15");
    expect(inflation.spark?.points).toHaveLength(2);
  });

  it("writes the Fed's target as a range", () => {
    const lower = series("DFEDTARL", { frequency: "DAILY", latest: { date: "2026-10-15", value: 3.75, period: "Oct 15" } });
    const upper = series("DFEDTARU", { frequency: "DAILY", latest: { date: "2026-10-15", value: 4, period: "Oct 15" } });
    expect(tile([lower, upper], "fed").value).toBe("3.75–4.00%");
    expect(tile([lower, upper], "fed").change).toBeNull();
  });

  it("shows jobs added rather than total payrolls", () => {
    const payrolls = series("PAYEMS", { transform: "mom_change", latest: { date: "2026-09-01", value: 159_044, period: "Sep 2026" }, change: 29 });
    expect(tile([payrolls], "jobs").value).toBe("+29K");
  });

  it("compares a level series with its previous observation, and gas with a year ago", () => {
    const rate = series("UNRATE", { latest: { date: "2026-09-01", value: 4.2, period: "Sep 2026" }, change: 0 });
    expect(tile([rate], "unemployment").change).toEqual({ text: "0.0 pts", direction: "flat", basis: "vs. prior month" });
    const gas = series("GASREGW", { frequency: "WEEKLY", transform: "yoy", latest: { date: "2026-10-12", value: 4.331, period: "Week ending Oct 12" }, change: 41.49 });
    expect(tile([gas], "gas")).toMatchObject({ value: "$4.33", change: { text: "+41.5%", basis: "vs. a year ago" } });
  });

  it("labels GDPNow with the quarter it estimates", () => {
    const now = series("GDPNOW", { frequency: "QUARTERLY", latest: { date: "2026-07-01", value: 3.6429, period: "Q3 2026" } });
    expect(tile([now], "gdpnow")).toMatchObject({ value: "3.6%", period: "Atlanta Fed estimate for Q3", change: null });
  });

  it("says Not available for a missing series and flags stale ones", () => {
    const sentiment = series("UMCSENT", { latest: { date: "2026-05-01", value: 51.7, period: "May 2026" }, change: -3.5, stale: true });
    const tiles = buildTiles(data([sentiment]));
    expect(tiles.find((item) => item.id === "sentiment")).toMatchObject({ value: "51.7", stale: true, change: { text: "−3.5", direction: "down" } });
    expect(tiles.find((item) => item.id === "unemployment")).toMatchObject({ value: "Not available", missing: true, stale: false, change: null, spark: null });
  });
});

describe("state tiles", () => {
  const usRate = series("UNRATE", {
    latest: { date: "2026-09-01", value: 4.3, period: "Sep 2026" },
    change: 0.1,
    history: [["2026-08-01", 4.2], ["2026-09-01", 4.3]],
  });
  const usPayrolls = series("PAYEMS", {
    transform: "mom_change",
    latest: { date: "2026-09-01", value: 159_044, period: "Sep 2026" },
    change: 29,
    changeHistory: [["2026-08-01", 12], ["2026-09-01", 29]],
  });
  const usHomes = series("USSTHPI", { frequency: "QUARTERLY", transform: "yoy", originalSource: "FHFA", latest: { date: "2026-04-01", value: 690, period: "Q2 2026" }, change: 2.6 });
  const national = [usRate, usPayrolls, usHomes, series("UMCSENT", { latest: { date: "2026-09-01", value: 55, period: "Sep 2026" } })];

  const caRate = series("CAUR", { stateCode: "CA", latest: { date: "2026-08-01", value: 5.5, period: "Aug 2026" }, change: -0.1, history: [["2026-07-01", 5.6], ["2026-08-01", 5.5]] });
  const vtJobs = series("VTNA", { stateCode: "VT", transform: "mom_change", latest: { date: "2026-08-01", value: 316.2, period: "Aug 2026" }, change: 0.4, changeHistory: [["2026-07-01", -0.2], ["2026-08-01", 0.4]] });
  const caGdp = series("CARQGSP", { stateCode: "CA", frequency: "QUARTERLY", transform: "qoq_annualized", originalSource: "BEA", latest: { date: "2026-04-01", value: 3_400_000, period: "Q2 2026" }, change: 2.84, changeHistory: [["2026-01-01", 1.1], ["2026-04-01", 2.84]] });

  it("replace the national tiles, and the U.S.-only tiles are hidden", () => {
    const tiles = buildTiles(data(national, { code: "CA", supported: true, series: [caRate, caGdp] }));
    expect(tiles.map((item) => item.id)).toEqual(["gdp", "unemployment", "jobs", "claims", "homes"]);
    expect(tiles.every((item) => item.scope === "state")).toBe(true);

    const rate = tiles.find((item) => item.id === "unemployment")!;
    expect(rate).toMatchObject({ value: "5.5%", period: "Aug 2026", change: { text: "−0.1 pts", basis: "vs. prior month" } });
    expect(rate.chart).toMatchObject({ unit: "Percent", frequency: "MONTHLY" });
    expect(rate.comparison).toMatchObject({ mode: "overlay", points: [[Date.parse("2026-08-01T00:00:00Z"), 4.2], [Date.parse("2026-09-01T00:00:00Z"), 4.3]] });

    const gdp = tiles.find((item) => item.id === "gdp")!;
    expect(gdp).toMatchObject({ value: "2.8%", change: { text: "+1.7 pts", basis: "vs. prior quarter" } });
    expect(gdp.chart?.unit).toBe("Percent change from prior quarter, annualized");
  });

  it("put the U.S. figure in the tooltip, and say Not available for a missing state series", () => {
    const tiles = buildTiles(data(national, { code: "VT", supported: true, series: [vtJobs] }));
    const jobs = tiles.find((item) => item.id === "jobs")!;
    expect(jobs).toMatchObject({ value: "+0.4K", change: null });
    expect(jobs.details).toContain("U.S.: +29K, Sep 2026");
    expect(jobs.comparison?.mode).toBe("stacked");

    const homes = tiles.find((item) => item.id === "homes")!;
    expect(homes).toMatchObject({ value: "Not available", missing: true, scope: "state", chart: null, comparison: null });
  });

  it("fall back to the national strip when FRED has no series for the state", () => {
    const tiles = buildTiles(data(national, { code: "PR", supported: false, series: [] }));
    expect(tiles).toHaveLength(14);
    expect(tiles.every((item) => item.scope === "national" && item.comparison === null)).toBe(true);
    expect(tiles.find((item) => item.id === "homes")).toMatchObject({ value: "+2.6%", period: "Q2 2026" });
  });
});
