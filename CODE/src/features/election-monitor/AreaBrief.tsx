import type { CSSProperties } from "react";
import "./areaBrief.css";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { pastResultsEnabled } from "@/lib/featureFlags";
import { districtLabel } from "./constants";
import { useCountyNames, useDemographics, type DemographicMetric } from "./demographics";
import { isRedistricted } from "./map/redistricting";
import { useSeatHolders } from "./oddsMap";
import { decisiveRace, formatPts, raceResult, usePastYear, usePresidentSeries, type HouseYear } from "./pastResults";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 });
const people = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const pct = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;

/** Race and ethnicity segments; not party colours, so the bar never reads as a vote. */
const RACE_SEGMENTS: Array<{ keys: string[]; label: string; color: string }> = [
  { keys: ["race_white"], label: "White", color: "#94a7c2" },
  { keys: ["race_hispanic"], label: "Hispanic", color: "#f4c769" },
  { keys: ["race_black"], label: "Black", color: "#5ce1c0" },
  { keys: ["race_asian"], label: "Asian", color: "#b8a2e3" },
  { keys: ["race_native", "race_pacific", "race_other", "race_multiracial"], label: "Other", color: "#e6a074" },
];

const KEY_FIGURES: Array<{ key: string; label: string; short: (value: number) => string }> = [
  { key: "population", label: "Population", short: (value) => people.format(value) },
  { key: "cvap", label: "Voting-age citizens", short: (value) => people.format(value) },
  { key: "median_household_income", label: "Median income", short: (value) => money.format(value) },
  { key: "education_ba_plus", label: "Bachelor's+", short: pct },
  { key: "poverty_rate", label: "Poverty", short: pct },
  { key: "unemployment_rate", label: "Unemployment", short: pct },
  { key: "age_65_plus", label: "Age 65+", short: pct },
  { key: "foreign_born", label: "Foreign-born", short: pct },
];

/** "D+4.2" or "R+13.7" from a Democratic-minus-Republican margin in points. */
const leanLabel = (margin: number) => (Math.abs(margin) < 0.05 ? "Even" : `${margin > 0 ? "D" : "R"}+${formatPts(Math.abs(margin))}`);
const leanTone = (margin: number) => (margin > 0 ? "d" : margin < 0 ? "r" : undefined);

const byKey = (metrics: DemographicMetric[] | null | undefined) => new Map((metrics ?? []).map((metric) => [metric.key, metric]));

/** Who holds the seats that cover the selection. */
function Holders({ state, district }: { state: string; district: string | null }) {
  const holders = useSeatHolders(true);
  if (!holders.data) return null;
  const senators = ["1", "2", "3"].flatMap((seat) => holders.data!.senate[`${state}-${seat}`] ?? []);
  const houseSeat = district ? holders.data.house[`${state}-${district}`] ?? holders.data.vacant[`${state}-${district}`] : null;
  const vacant = district ? Boolean(holders.data.vacant[`${state}-${district}`]) : false;
  return (
    <p className="em-brief-line">
      {district && houseSeat && (
        <span><b>House</b> {houseSeat.name} ({houseSeat.party}){vacant ? ", vacant" : ""}{isRedistricted(state) ? " · 2024 lines" : ""}</span>
      )}
      {senators.length > 0 && <span><b>Senate</b> {senators.map((senator) => `${senator.name} (${senator.party})`).join(", ")}</span>}
    </p>
  );
}

/** Presidential margins for a state or one county, and the 2024 House result for one district. */
function VoteHistory({ state, county, district, statewideOnly }: {
  state: string;
  county: string | null;
  district: string | null;
  /** The selection is part of the state with no presidential series of its own (districts, several counties). */
  statewideOnly: boolean;
}) {
  const series = usePresidentSeries(pastResultsEnabled);
  const house = usePastYear<HouseYear>("house", district ? 2024 : null);
  const margins = series.data ? (county ? series.data.counties[county] : series.data.states[state]) : undefined;
  const recent = series.data && margins ? series.data.years.map((year, index) => [year, margins[index]] as const).filter(([, value]) => value !== null).slice(-3) : [];
  const houseResult = district && house.data ? raceResult(decisiveRace(house.data.districts[`${state}-${district}`])) : null;
  if (recent.length === 0 && !houseResult) return null;
  let houseText: string | null = null;
  if (houseResult?.status === "ok" && houseResult.winner) {
    const runnerUp = houseResult.runnerUp?.party;
    houseText = houseResult.winner.party === "O" || runnerUp === "O" || !runnerUp
      ? `${houseResult.winner.party} won by ${formatPts(houseResult.margin!)}`
      : leanLabel(houseResult.winner.party === "D" ? houseResult.margin! : -houseResult.margin!);
  } else if (houseResult?.status === "unopposed") houseText = `${houseResult.winner?.party ?? ""} unopposed`;
  return (
    <p className="em-brief-line">
      {recent.length > 0 && (
        <span>
          <b>President{statewideOnly ? ` · ${state} statewide` : ""}</b>
          {recent.map(([year, margin]) => <span key={year} className="em-brief-lean" data-tone={leanTone(margin!)}>{year} {leanLabel(margin!)}</span>)}
        </span>
      )}
      {houseText && <span><b>House 2024</b> <span className="em-brief-lean" data-tone={houseText.startsWith("D") ? "d" : houseText.startsWith("R") ? "r" : undefined}>{houseText}</span></span>}
    </p>
  );
}

export function RaceMixBar({ metrics }: { metrics: Map<string, DemographicMetric> }) {
  const segments = RACE_SEGMENTS.map((segment) => ({
    ...segment,
    value: segment.keys.reduce((sum, key) => sum + (metrics.get(key)?.value ?? 0), 0),
  })).filter((segment) => segment.value > 0);
  if (segments.length === 0) return null;
  const summary = segments.map((segment) => `${segment.label} ${pct(segment.value)}`).join(", ");
  return (
    <div className="em-brief-race">
      <div className="em-brief-race-bar" role="img" aria-label={`Race and ethnicity: ${summary}`}>
        {segments.map((segment) => <span key={segment.label} style={{ width: `${segment.value * 100}%`, background: segment.color } as CSSProperties} title={`${segment.label}: ${pct(segment.value)}`} />)}
      </div>
      <ul className="em-brief-race-legend" aria-hidden="true">
        {segments.map((segment) => <li key={segment.label}><i style={{ background: segment.color }} />{segment.label} {pct(segment.value)}</li>)}
      </ul>
    </div>
  );
}

/**
 * At-a-glance profile of whatever is selected on the map: who holds the seats,
 * recent vote margins, and the Census figures analysts reach for first. Each
 * figure is compared with the state (for a part of a state) or the U.S.
 */
export function AreaBrief({ stateCode, stateName, district, districts, counties, onOpenProfile }: {
  stateCode: string | null;
  stateName: string | null;
  district: string | null;
  /** Every selected district, including `district`. */
  districts: string[];
  counties: string[];
  onOpenProfile: () => void;
}) {
  // Counties narrow the figures when chosen; otherwise the districts, otherwise the state.
  const demoCounties = counties;
  const demoDistricts = counties.length ? [] : districts;
  const demographics = useDemographics(stateCode, demoCounties, demoDistricts);
  const countyNames = useCountyNames(counties.length ? stateCode : null);

  if (!stateCode) {
    return (
      <section className="em-brief" aria-label="Area profile">
        <p className="em-brief-hint"><MousePointerClick aria-hidden="true" />Click a state, then a district or county, for its profile: seat holders, vote history, demographics and economy. Shift-click to combine areas.</p>
      </section>
    );
  }

  const single = counties.length === 1 ? counties[0] : null;
  const title = counties.length
    ? single ? `${countyNames.get(single) ?? `County ${single}`}, ${stateCode}` : `${counties.length} counties in ${stateCode}`
    : districts.length > 1 ? `${districts.length} districts in ${stateCode}` : district ? districtLabel(stateCode, district) : stateName ?? stateCode;
  const data = demographics.data && demographics.data.selection.state === stateCode ? demographics.data : null;
  const combined = byKey(data?.combined);
  const statewide = !counties.length && !districts.length;
  const reference = byKey(statewide ? data?.benchmarks.nation?.metrics : data?.benchmarks.state?.metrics);
  const referenceName = statewide ? "US" : stateCode;

  return (
    <section className="em-brief" aria-label={`Profile of ${title}`} aria-busy={demographics.isFetching}>
      <div className="em-brief-head">
        <strong>{title}</strong>
        <button type="button" className="em-brief-more" onClick={onOpenProfile}>Full demographics<ArrowRight aria-hidden="true" /></button>
      </div>
      <Holders state={stateCode} district={districts.length <= 1 && !counties.length ? district : null} />
      <VoteHistory
        state={stateCode}
        county={single}
        district={districts.length <= 1 && !counties.length ? district : null}
        statewideOnly={!statewide && !single}
      />
      {data?.combined ? (
        <>
          <dl className="em-brief-figures">
            {KEY_FIGURES.map((figure) => {
              const metric = combined.get(figure.key);
              if (!metric || metric.value === null) return null;
              const ref = reference.get(figure.key)?.value;
              return (
                <div key={figure.key}>
                  <dt>{figure.label}</dt>
                  <dd>{figure.short(metric.value)}{metric.lowReliability ? "*" : ""}</dd>
                  {metric.kind !== "count" && ref != null && <span>{referenceName} {figure.short(ref)}</span>}
                </div>
              );
            })}
          </dl>
          <RaceMixBar metrics={combined} />
        </>
      ) : (
        <p className="em-brief-hint">{demographics.isError ? "Census figures unavailable." : demographics.isLoading ? "Loading Census figures…" : "No Census figures for this selection."}</p>
      )}
    </section>
  );
}
