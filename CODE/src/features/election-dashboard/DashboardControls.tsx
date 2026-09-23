import type {
  DashboardOfficeFilter,
  DashboardViewState,
  StateMapItemViewModel,
} from "./types";

const officeOptions: Array<{ value: DashboardOfficeFilter; label: string }> = [
  { value: "ALL", label: "All mock contests" },
  { value: "US_HOUSE", label: "U.S. House" },
  { value: "US_SENATE", label: "U.S. Senate" },
  { value: "STATEWIDE_EXECUTIVE", label: "Statewide example" },
  { value: "COUNTY_OFFICE", label: "County example" },
];

export function DashboardControls({
  states,
  stateCode,
  district,
  office,
  viewState,
  onStateChange,
  onDistrictChange,
  onOfficeChange,
  onViewStateChange,
}: {
  states: StateMapItemViewModel[];
  stateCode: string;
  district: string;
  office: DashboardOfficeFilter;
  viewState: DashboardViewState;
  onStateChange: (stateCode: string) => void;
  onDistrictChange: (district: string) => void;
  onOfficeChange: (office: DashboardOfficeFilter) => void;
  onViewStateChange: (state: DashboardViewState) => void;
}) {
  return (
    <aside className="ed-controls" aria-label="Dashboard selection and fixture controls">
      <section>
        <span className="ed-eyebrow">Location</span>
        <label className="ed-field-label" htmlFor="dashboard-state">State</label>
        <select id="dashboard-state" value={stateCode} onChange={(event) => onStateChange(event.target.value)}>
          {states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
        </select>
        <label className="ed-field-label" htmlFor="dashboard-district">Mock district</label>
        <select id="dashboard-district" value={district} onChange={(event) => onDistrictChange(event.target.value)}>
          {["00", "01", "02", "03", "04", "07"].map((item) => <option key={item} value={item}>District {item}</option>)}
        </select>
      </section>

      <section>
        <span className="ed-eyebrow">Contest type</span>
        <div className="ed-segmented" aria-label="Filter contests by office">
          {officeOptions.map((option) => (
            <button key={option.value} type="button" aria-pressed={office === option.value} onClick={() => onOfficeChange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <span className="ed-eyebrow">State preview</span>
        <p className="ed-control-help">Day 0 QA control for testing explicit data conditions.</p>
        <select aria-label="Preview a data condition" value={viewState} onChange={(event) => onViewStateChange(event.target.value as DashboardViewState)}>
          <option value="ready">Current mock data</option>
          <option value="loading">Loading</option>
          <option value="stale">Stale</option>
          <option value="partial">Partial coverage</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </section>
    </aside>
  );
}
