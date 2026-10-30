import { useState } from "react";
import { Check, ClipboardCopy, CloudOff, Database, Download, Loader2, MousePointerClick, Users, X } from "lucide-react";
import { districtLabel, formatShortDate, numberFormat } from "./constants";
import { RaceMixBar } from "./AreaBrief";
import { comparisonFor, demographicsTable, formatMoe, formatValue, percent, toCsv, toTsv, useCountyNames, useDemographics, DemographicsError, type Comparison, type DemographicMetric, type DemographicsData } from "./demographics";
import { isRedistricted } from "./map/redistricting";

const byKey = (metrics: DemographicMetric[] | null | undefined) => new Map((metrics ?? []).map((metric) => [metric.key, metric]));

function Empty({ icon: Icon, title, copy, spin }: { icon: typeof CloudOff; title: string; copy: string; spin?: boolean }) {
  return <div className="em-empty"><Icon aria-hidden="true" className={spin ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>;
}

const TILES = ["population", "cvap", "households", "median_household_income", "poverty_rate", "education_ba_plus", "unemployment_rate", "median_home_value"];

export function Tiles({ data, stateCode, keys = TILES }: { data: DemographicsData; stateCode: string; keys?: string[] }) {
  const combined = byKey(data.combined);
  const state = byKey(data.benchmarks.state?.metrics);
  const nation = byKey(data.benchmarks.nation?.metrics);
  const statewide = data.selection.mode === "state";
  return (
    <dl className="em-metrics em-demo-tiles">
      {keys.map((key) => {
        const metric = combined.get(key);
        if (!metric) return null;
        // Medians that cannot be combined are left out rather than shown as blank.
        if (metric.kind === "median" && metric.value === null && data.areas.length > 1) return null;
        const moe = formatMoe(metric);
        const showBenchmarks = metric.kind !== "count";
        return (
          <div className="em-metric" key={key}>
            <dt>{metric.label}</dt>
            <dd>
              {formatValue(metric)}
              {metric.lowReliability && <abbr className="em-demo-flag" title="Low reliability: margin of error is large relative to the estimate">*</abbr>}
            </dd>
            {moe && <span className="em-demo-moe">{moe}</span>}
            {metric.estimated && metric.value !== null && <span className="em-demo-moe" title="Interpolated from household income brackets, because medians cannot be added across areas">Estimated from brackets</span>}
            {showBenchmarks && (
              <span className="em-demo-bench">
                {statewide ? "" : `${stateCode} ${formatValue(state.get(key) ?? metric)} · `}US {formatValue(nation.get(key) ?? metric)}
              </span>
            )}
          </div>
        );
      })}
    </dl>
  );
}


/** Every share the API returns, grouped; together with the tiles this is the full ACS profile. */
const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: "Race and ethnicity", keys: ["race_white", "race_hispanic", "race_black", "race_asian", "race_native", "race_pacific", "race_other", "race_multiracial"] },
  { title: "Age", keys: ["age_under_18", "age_18_29", "age_30_44", "age_45_64", "age_65_plus"] },
  { title: "Household income", keys: ["income_under_25k", "income_25k_50k", "income_50k_75k", "income_75k_100k", "income_100k_150k", "income_150k_200k", "income_200k_plus"] },
  { title: "Education (adults 25+)", keys: ["education_hs_plus", "education_ba_plus"] },
  { title: "Work and housing", keys: ["unemployment_rate", "poverty_rate", "owner_occupied"] },
  { title: "Background", keys: ["veterans", "foreign_born"] },
];


/**
 * One single-hue bar per category, scaled to the largest value in the group so
 * small groups stay visible; each row is labeled with its value, and a tick marks
 * the comparison area's share: the state, or the US for a statewide view.
 */
export function ShareBars({ data, comparison, title, keys }: { data: DemographicsData; comparison: Comparison; title: string; keys: string[] }) {
  const combined = byKey(data.combined);
  const rows = keys.flatMap((key) => combined.get(key) ?? []).filter((metric) => metric.kind === "share");
  const reference = byKey(comparison.metrics);
  const max = Math.max(0.0001, ...rows.flatMap((metric) => [metric.value ?? 0, reference.get(metric.key)?.value ?? 0]));
  if (rows.length === 0) return null;
  const id = `em-demo-${keys[0]}`;
  return (
    <figure className="em-demo-group" aria-labelledby={id}>
      <figcaption id={id}>{title}</figcaption>
      {rows.map((metric) => {
        const stateValue = reference.get(metric.key)?.value ?? null;
        const moe = formatMoe(metric);
        return (
          <div
            className="em-demo-row"
            key={metric.key}
            title={`${metric.label}: ${formatValue(metric)}${moe ? ` (${moe})` : ""}${metric.count != null ? `, ${numberFormat.format(metric.count)} people or households` : ""}. ${comparison.short}: ${stateValue === null ? "—" : percent(stateValue)}.`}
          >
            <span>{metric.label}</span>
            <div className="em-demo-bar" aria-hidden="true">
              <span style={{ width: `${((metric.value ?? 0) / max) * 100}%` }} />
              {stateValue !== null && <i style={{ left: `${(stateValue / max) * 100}%` }} />}
            </div>
            <strong>{formatValue(metric)}{metric.lowReliability ? "*" : ""}</strong>
          </div>
        );
      })}
    </figure>
  );
}

/**
 * Every figure for the selection, each selected area, the state, and the U.S., with
 * margins of error, ready to download as CSV or paste into a spreadsheet.
 */
function DataTable({ data, stateCode, title }: { data: DemographicsData; stateCode: string; title: string }) {
  const table = demographicsTable(data);
  const [copied, setCopied] = useState(false);
  const fileName = `voteinformed-acs${data.acsYear}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(toTsv(table)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <details className="em-demo-data">
      <summary>All figures ({table.metrics.length} measures × {table.columns.length} areas)</summary>
      <div className="em-demo-export">
        <button type="button" onClick={download}><Download aria-hidden="true" />Download CSV</button>
        <button type="button" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}{copied ? "Copied" : "Copy for spreadsheet"}</button>
      </div>
      <div className="em-demo-scroll">
        <table className="em-past-table em-demo-table">
          <caption className="sr-only">ACS {data.acsYear} figures for {title}, {stateCode}, and the U.S.</caption>
          <thead><tr><th scope="col">Measure</th>{table.columns.map((column) => <th key={column.id} scope="col" title={column.name}>{column.label}</th>)}</tr></thead>
          <tbody>
            {table.metrics.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {table.columns.map((column) => {
                  const metric = column.metrics.get(row.key);
                  const moe = metric ? formatMoe(metric) : null;
                  return <td key={column.id} title={moe ?? undefined}>{metric ? formatValue(metric) : "—"}{metric?.lowReliability ? "*" : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Pieces({ data }: { data: DemographicsData }) {
  const total = byKey(data.combined).get("population")?.value ?? null;
  return (
    <table className="em-demo-pieces">
      <caption>{data.selection.mode === "overlap" ? "Overlapping pieces" : "Included areas"}</caption>
      <thead><tr><th scope="col">Area</th><th scope="col">Population</th><th scope="col">Share</th></tr></thead>
      <tbody>
        {data.areas.map((area) => {
          const population = byKey(area.metrics).get("population")?.value ?? null;
          return (
            <tr key={area.geoid}>
              <th scope="row" title={area.name}>{area.label}</th>
              <td>{population === null ? "—" : numberFormat.format(population)}</td>
              <td>{population === null || !total ? "—" : percent(population / total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DemographicsTab({
  stateCode,
  stateName,
  counties,
  districts,
  districtOptions,
  onCountiesChange,
  onDistrictsChange,
  onClear,
}: {
  stateCode: string | null;
  stateName: string | null;
  counties: string[];
  districts: string[];
  /** House districts with contests in the state, for the keyboard picker. */
  districtOptions: string[];
  onCountiesChange: (counties: string[]) => void;
  onDistrictsChange: (districts: string[]) => void;
  /** Clears counties and districts in one URL update, back to the statewide view. */
  onClear: () => void;
}) {
  const demographics = useDemographics(stateCode, counties, districts);
  const countyNames = useCountyNames(stateCode);
  const countyLabel = (fips: string) => countyNames.get(fips) ?? `County ${fips}`;
  const data = demographics.data;
  const hasSelection = counties.length > 0 || districts.length > 0;
  const mode = counties.length && districts.length ? "overlap" : counties.length ? "counties" : districts.length ? "districts" : "state";
  const describe = {
    state: `Statewide figures for ${stateName ?? stateCode}. Select counties or House districts on the map to narrow down, or both to see where they overlap.`,
    counties: counties.length === 1 ? "The selected county." : "The selected counties combined.",
    districts: districts.length === 1 ? "The selected House district." : "The selected House districts combined.",
    overlap: "Only the parts of the selected counties that lie inside the selected districts.",
  }[mode];

  const removable = [
    ...counties.map((fips) => ({ key: `c${fips}`, label: countyLabel(fips), remove: () => onCountiesChange(counties.filter((item) => item !== fips)) })),
    ...districts.map((code) => ({ key: `d${code}`, label: stateCode ? districtLabel(stateCode, code) : code, remove: () => onDistrictsChange(districts.filter((item) => item !== code)) })),
  ];

  let body;
  if (!stateCode) body = <Empty icon={MousePointerClick} title="Select a state" copy="Pick a state, then select counties or House districts on the map." />;
  else if (demographics.isError && !data) {
    const notLoaded = demographics.error instanceof DemographicsError && demographics.error.notLoaded;
    body = notLoaded
      ? <Empty icon={Database} title="Census data not loaded yet" copy="ACS demographics have not been loaded into VoteInformed yet." />
      : <Empty icon={CloudOff} title="Demographics unavailable" copy="The demographics API could not be reached." />;
  } else if (!data) body = <Empty icon={Loader2} spin title="Loading demographics" copy="Fetching Census estimates for this selection." />;
  else if (!data.combined) {
    const missing = [...data.missing.counties.map(countyLabel), ...data.missing.districts.map((code) => districtLabel(stateCode, code))];
    body = missing.length > 0
      ? <Empty icon={Users} title="No Census data" copy={`Census has no figures for ${missing.join(", ")} in the ${data.acsYear} estimates.`} />
      : <Empty icon={Users} title="No overlap" copy="None of the selected counties lie inside the selected districts." />;
  } else {
    const unmatchedCounties = [...data.noOverlap.counties, ...data.missing.counties];
    const unmatchedDistricts = [...data.noOverlap.districts, ...data.missing.districts];
    const comparison = comparisonFor(data, stateName, stateCode);
    const title = mode === "state" ? stateName ?? stateCode : removable.map((item) => item.label).join(", ");
    body = (
      <>
        <Tiles data={data} stateCode={stateCode} />
        <RaceMixBar metrics={byKey(data.combined)} />
        <div className="em-demo-legend" aria-hidden="true">
          <span><i data-swatch="bar" />{data.selection.mode === "state" ? stateName ?? stateCode : "Selection"}</span>
          <span><i data-swatch="tick" />{comparison.label}</span>
        </div>
        {GROUPS.map((group) => <ShareBars key={group.title} data={data} comparison={comparison} title={group.title} keys={group.keys} />)}
        {(data.areas.length > 1 || data.selection.mode === "overlap") && <Pieces data={data} />}
        <DataTable data={data} stateCode={stateCode} title={title} />
        {(unmatchedCounties.length > 0 || unmatchedDistricts.length > 0) && (
          <div className="em-note" role="note">
            Not included: {[...unmatchedCounties.map(countyLabel), ...unmatchedDistricts.map((code) => districtLabel(stateCode, code))].join(", ")}
            {data.selection.mode === "overlap" ? " (no overlap with the other selection, or no Census data)." : " (no Census data for this vintage)."}
          </div>
        )}
      </>
    );
  }


  return (
    <section className="em-card" aria-labelledby="em-demo-heading" aria-busy={demographics.isFetching}>
      <h3 id="em-demo-heading">Demographics</h3>
      <p>{stateCode ? describe : "Census estimates for a state, or for the counties and districts you select."}{hasSelection ? " Shift-click the map to select more than one." : ""}</p>

      {stateCode && (
        <div className="em-demo-pickers">
          <label className="sr-only" htmlFor="em-demo-add-county">Add a county</label>
          <select id="em-demo-add-county" value="" disabled={countyNames.size === 0} onChange={(event) => event.target.value && onCountiesChange([...counties, event.target.value].sort())}>
            <option value="">{countyNames.size === 0 ? "Loading counties…" : "Add a county"}</option>
            {[...countyNames].filter(([fips]) => !counties.includes(fips)).map(([fips, name]) => <option key={fips} value={fips}>{name}</option>)}
          </select>
          <label className="sr-only" htmlFor="em-demo-add-district">Add a House district</label>
          <select id="em-demo-add-district" value="" disabled={districtOptions.length === 0} onChange={(event) => event.target.value && onDistrictsChange([...districts, event.target.value].sort())}>
            <option value="">{districtOptions.length === 0 ? "No districts loaded" : "Add a district"}</option>
            {districtOptions.filter((code) => !districts.includes(code)).map((code) => <option key={code} value={code}>{districtLabel(stateCode, code)}</option>)}
          </select>
        </div>
      )}

      {removable.length > 0 && (
        <ul className="em-demo-chips" aria-label="Selected areas">
          {removable.map((item) => (
            <li key={item.key}>
              {item.label}
              <button type="button" onClick={item.remove} aria-label={`Remove ${item.label}`}><X aria-hidden="true" /></button>
            </li>
          ))}
          <li><button type="button" className="em-demo-clear" onClick={onClear}>Whole state</button></li>
        </ul>
      )}

      {body}

      {stateCode && districts.length > 0 && isRedistricted(stateCode) && (
        <div className="em-note" role="note">
          {stateName ?? stateCode} adopted a new congressional map for 2026. Census figures use the 2024 district lines (119th Congress).
        </div>
      )}
      {data?.combined && (
        <p className="em-demo-source">
          Source: <a className="em-link" href={data.source.homepageUrl ?? "https://www.census.gov/programs-surveys/acs"} target="_blank" rel="noopener noreferrer">{data.source.dataset} ↗</a>, U.S. Census Bureau
          {data.congress ? `, ${data.congress}th Congress districts` : ""}
          {data.source.fetchedAt ? `. Loaded ${formatShortDate(data.source.fetchedAt)}` : ""}.
          {" "}± values are 90% margins of error; * marks estimates whose margin is large relative to the value. Figures describe the area and are not a forecast of how it votes.
        </p>
      )}
    </section>
  );
}
