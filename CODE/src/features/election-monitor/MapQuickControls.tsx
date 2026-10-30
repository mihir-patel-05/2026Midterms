import { districtLabel, layerOptions } from "./constants";
import type { MapLayer, MonitorStateSummary } from "./types";

/** Location and layer pickers for the expanded map, which hides the sidebar that normally holds them. */
export function MapQuickControls({ states, stateCode, districts, district, layer, showLayers, onStateChange, onDistrictChange, onLayerChange }: {
  states: MonitorStateSummary[];
  stateCode: string | null;
  /** House districts with contests in the selected state. */
  districts: string[];
  district: string | null;
  layer: MapLayer;
  /** Off in Past results, where the office picks the layer. */
  showLayers: boolean;
  onStateChange: (code: string | null) => void;
  onDistrictChange: (district: string | null) => void;
  onLayerChange: (layer: MapLayer) => void;
}) {
  const sortedStates = [...states].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="em-quick" role="group" aria-label="Map location and layer">
      <label className="em-past-select">
        <span className="sr-only">Location</span>
        <select value={stateCode ?? ""} onChange={(event) => onStateChange(event.target.value || null)}>
          <option value="">United States</option>
          {sortedStates.map((state) => (
            <option key={state.code} value={state.code}>{state.name}{state.isFictional ? " (fictional)" : ""}</option>
          ))}
        </select>
      </label>
      {stateCode && districts.length > 0 && (
        <label className="em-past-select">
          <span className="sr-only">House district</span>
          <select value={district ?? ""} onChange={(event) => onDistrictChange(event.target.value || null)}>
            <option value="">All districts</option>
            {districts.map((item) => <option key={item} value={item}>{districtLabel(stateCode, item)}</option>)}
          </select>
        </label>
      )}
      {showLayers && (
        <div className="em-seg" role="group" aria-label="Map layer">
          {layerOptions.map((option) => (
            <button key={option.value} type="button" aria-pressed={layer === option.value} onClick={() => onLayerChange(option.value)}>{option.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
