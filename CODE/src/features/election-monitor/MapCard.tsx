import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { MapMode } from "./types";

const layerDescriptions = {
  states: "Select a state to inspect its federal contests",
  districts: "Congressional districts for the selected state",
  counties: "County reporting units where a results source provides them",
} as const;

export function MapCard({ layer, readout, children, mode = "races", onModeChange, pastControls, pastLegend, expanded = false, onExpandedChange }: {
  layer: keyof typeof layerDescriptions;
  readout: string;
  children: ReactNode;
  mode?: MapMode;
  /** Omitted when the Past results feature flag is off, which hides the mode switch. */
  onModeChange?: (mode: MapMode) => void;
  pastControls?: ReactNode;
  pastLegend?: ReactNode;
  /** The map fills the window; the toolbar button switches it. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const past = mode === "past";
  return (
    <section className="em-map-card" aria-labelledby="em-map-heading">
      <div className="em-map-toolbar">
        <div>
          <strong id="em-map-heading">United States election map</strong>
          <span>{past ? "How states, districts, and counties voted in past elections" : layerDescriptions[layer]}</span>
        </div>
        {onModeChange && (
          <div className="em-seg em-mode" role="group" aria-label="Map mode">
            <button type="button" aria-pressed={!past} onClick={() => onModeChange("races")}>2026 races</button>
            <button type="button" aria-pressed={past} onClick={() => onModeChange("past")}>Past results</button>
          </div>
        )}
        {!past && <div className="em-legend" aria-label="Data readiness legend">
          <span className="em-legend-item" data-readiness="ready"><i />Races on file</span>
          <span className="em-legend-item" data-readiness="partial"><i />No candidates yet</span>
          <span className="em-legend-item" data-readiness="pending"><i />No data</span>
          {layer === "districts" && <span className="em-legend-item" data-readiness="outdated"><i />2026 lines differ</span>}
        </div>}
        {onExpandedChange && (
          <div className="em-map-actions">
            <button
              type="button"
              className="em-map-action"
              aria-pressed={expanded}
              title={expanded ? "Back to the dashboard (Esc)" : "Fill the window with the map"}
              onClick={() => onExpandedChange(!expanded)}
            >
              {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              <span>{expanded ? "Exit" : "Expand"}<span className="sr-only"> map</span></span>
            </button>
          </div>
        )}
      </div>
      {past && pastControls}
      {children}
      {past && pastLegend}
      <div className="em-map-caption">
        <span>{past ? "Past results are from MIT Election Lab files and are never shown as 2026 counts." : "Readiness reflects data loaded into VoteInformed, not election outcomes."}</span>
        <span>{readout}</span>
      </div>
    </section>
  );
}
