import { CENSUS_METRICS, CENSUS_NO_DATA, censusMetricOption, formatCensusValue, type CensusView } from "./censusMap";
import { formatShortDate } from "./constants";
import { Swatch } from "./PastResultsControls";
import type { MapLayer } from "./types";

const groups = [...new Set(CENSUS_METRICS.map((metric) => metric.group))];
const levelWords: Record<MapLayer, string> = { states: "state", districts: "House district", counties: "county" };

/** Metric and level pickers for the Census map. */
export function CensusControls({ metric, layer, onMetricChange, onLayerChange }: {
  metric: string;
  layer: MapLayer;
  onMetricChange: (metric: string) => void;
  onLayerChange: (layer: MapLayer) => void;
}) {
  return (
    <div className="em-past-controls" role="group" aria-label="Census map options">
      <label className="em-past-select">
        <span>Colour by</span>
        <select value={metric} onChange={(event) => onMetricChange(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {CENSUS_METRICS.filter((item) => item.group === group).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="em-seg" role="group" aria-label="Map by">
        {(["states", "districts", "counties"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={layer === item} onClick={() => onLayerChange(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}</button>
        ))}
      </div>
    </div>
  );
}

/** Quantile legend for the Census map, with the U.S. figure for reference. */
export function CensusLegend({ view, metric, layer, loading, error }: { view: CensusView | null; metric: string; layer: MapLayer; loading: boolean; error: (Error & { notLoaded?: boolean }) | null }) {
  const option = censusMetricOption(metric);
  return (
    <div className="em-past-legend">
      <p className="em-past-label">
        <strong>{option.label}</strong> by {levelWords[layer]}
        {view?.data.nation != null ? ` · U.S. ${formatCensusValue(option.kind, view.data.nation)}` : ""}. Census estimates describe who lives there, not how they vote.
      </p>
      {error && <p className="em-note" role="status">{error.notLoaded ? "Census figures have not been loaded into VoteInformed yet." : "Census figures could not be loaded."}</p>}
      {loading && <p className="em-note" role="status">Loading Census figures…</p>}
      {view && (
        <div className="em-past-scale" role="img" aria-label={`${option.label}, lowest to highest: ${view.legend.map((step) => step.label).join(", ")}`}>
          {view.legend.map((step) => (
            <span key={step.bin} className="em-census-step">
              <Swatch color={step.color} label={step.label} />
              <span>{step.label}</span>
            </span>
          ))}
        </div>
      )}
      <ul className="em-past-greys"><li><Swatch color={CENSUS_NO_DATA} />No Census figure</li></ul>
      <details className="em-past-method">
        <summary>How this is calculated</summary>
        <ul>
          <li>Each colour holds about the same number of {levelWords[layer]} areas (quantiles across the whole country), so the map shows rank, not equal-sized steps.</li>
          <li>Shares and medians come from the American Community Survey 5-year estimates. Small areas have wide margins of error; the area's tooltip flags the least reliable ones.</li>
          {layer === "districts" && <li>House districts use the {view?.data.congress ?? 119}th Congress lines. States that redrew for 2026 are not reflected.</li>}
        </ul>
      </details>
      {view && (
        <p className="em-past-source">
          Source: U.S. Census Bureau, {view.data.source.dataset}{view.data.source.fetchedAt ? `, loaded ${formatShortDate(view.data.source.fetchedAt)}` : ""}.
        </p>
      )}
    </div>
  );
}
