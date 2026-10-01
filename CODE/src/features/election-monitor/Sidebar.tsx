import type { ReactNode } from "react";
import { districtLabel } from "./constants";
import type { MapLayer, MonitorStateSummary, OfficeFilter } from "./types";

const officeOptions: Array<{ value: OfficeFilter; label: string; icon: string }> = [
  { value: "ALL", label: "All federal", icon: "◎" },
  { value: "US_SENATE", label: "U.S. Senate", icon: "S" },
  { value: "US_HOUSE", label: "U.S. House", icon: "H" },
];

const layerOptions: Array<{ value: MapLayer; label: string }> = [
  { value: "states", label: "States" },
  { value: "districts", label: "House districts" },
  { value: "counties", label: "Counties" },
];

export interface SidebarHealthRow {
  label: string;
  value: string;
}

export function Sidebar({
  states,
  stateCode,
  districts,
  district,
  office,
  officeCounts,
  layer,
  health,
  children,
  onStateChange,
  onDistrictChange,
  onOfficeChange,
  onLayerChange,
}: {
  states: MonitorStateSummary[];
  stateCode: string | null;
  districts: string[];
  district: string | null;
  office: OfficeFilter;
  officeCounts: Record<OfficeFilter, number | null>;
  layer: MapLayer;
  health: { label: string; tone: "good" | "warn" | "bad"; rows: SidebarHealthRow[] };
  /** Extra sections (e.g. dev-only QA controls). */
  children?: ReactNode;
  onStateChange: (code: string | null) => void;
  onDistrictChange: (district: string | null) => void;
  onOfficeChange: (office: OfficeFilter) => void;
  onLayerChange: (layer: MapLayer) => void;
}) {
  const sortedStates = [...states].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="em-sidebar" aria-label="Dashboard filters">
      <section className="em-side-section" data-mobile="full">
        <label className="em-section-label" htmlFor="em-state">Location</label>
        <div className="em-select">
          <select id="em-state" value={stateCode ?? ""} onChange={(event) => onStateChange(event.target.value || null)}>
            <option value="">United States</option>
            {sortedStates.map((state) => (
              <option key={state.code} value={state.code}>{state.name}{state.isFictional ? " (fictional)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="em-select">
          <label className="sr-only" htmlFor="em-district">House district</label>
          <select
            id="em-district"
            value={district ?? ""}
            disabled={!stateCode || districts.length === 0}
            onChange={(event) => onDistrictChange(event.target.value || null)}
          >
            <option value="">{stateCode && districts.length === 0 ? "No House contests loaded" : "All districts"}</option>
            {stateCode && districts.map((item) => (
              <option key={item} value={item}>{districtLabel(stateCode, item)}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="em-side-section" data-mobile="full">
        <span className="em-section-label" id="em-office-label">Office</span>
        <div className="em-filter-list" data-mobile="row" role="group" aria-labelledby="em-office-label">
          {officeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="em-filter"
              aria-pressed={office === option.value}
              onClick={() => onOfficeChange(option.value)}
            >
              <span className="em-filter-icon" aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
              <span className="em-filter-count">{officeCounts[option.value] ?? "–"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="em-side-section" data-mobile="full">
        <span className="em-section-label" id="em-layer-label">Map layer</span>
        <div className="em-filter-list" data-mobile="row" role="group" aria-labelledby="em-layer-label">
          {layerOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="em-layer"
              aria-pressed={layer === option.value}
              onClick={() => onLayerChange(option.value)}
            >
              <span className="em-swatch" data-layer={option.value} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="em-side-section" data-mobile="hide">
        <span className="em-section-label">Data status</span>
        <div className="em-health">
          <div className="em-health-head">
            <span>Source health</span>
            <span className="em-health-value" data-tone={health.tone}>{health.label}</span>
          </div>
          {health.rows.map((row) => (
            <div className="em-health-row" key={row.label}><span>{row.label}</span><span>{row.value}</span></div>
          ))}
        </div>
      </section>

      {children}
    </aside>
  );
}
