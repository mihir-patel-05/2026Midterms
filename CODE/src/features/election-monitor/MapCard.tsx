import { useState, type ReactNode } from "react";
import { Expand, Layers, Maximize2, Minimize2, Shrink } from "lucide-react";
import type { MapMode } from "./types";

const layerDescriptions = {
  states: "Select a state to inspect its federal contests",
  districts: "Congressional districts for the selected state",
  counties: "County reporting units where a results source provides them",
} as const;

export function MapCard({ layer, readout, children, mode = "races", onModeChange, pastControls, pastLegend, expanded = false, onExpandedChange, fullscreen = false, onFullscreenToggle, quickControls, hud }: {
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
  /** Browser fullscreen, offered once expanded; omitted where the browser can't do it. */
  fullscreen?: boolean;
  onFullscreenToggle?: () => void;
  /** Location and layer pickers, shown in the toolbar while expanded (the sidebar is hidden then). */
  quickControls?: ReactNode;
  /** Data that floats over the expanded map, under the legend. */
  hud?: ReactNode;
}) {
  const past = mode === "past";
  const [hudOpen, setHudOpen] = useState(true);
  const readinessLegend = (
    <div className="em-legend" aria-label="Data readiness legend">
      <span className="em-legend-item" data-readiness="ready"><i />Races on file</span>
      <span className="em-legend-item" data-readiness="partial"><i />No candidates yet</span>
      <span className="em-legend-item" data-readiness="pending"><i />No data</span>
      {layer === "districts" && <span className="em-legend-item" data-readiness="outdated"><i />2026 lines differ</span>}
    </div>
  );
  return (
    <section className="em-map-card" aria-labelledby="em-map-heading">
      <div className="em-map-toolbar">
        <div className="em-map-title">
          <strong id="em-map-heading">United States election map</strong>
          <span>{past ? "How states, districts, and counties voted in past elections" : layerDescriptions[layer]}</span>
        </div>
        {onModeChange && (
          <div className="em-seg em-mode" role="group" aria-label="Map mode">
            <button type="button" aria-pressed={!past} onClick={() => onModeChange("races")}>2026 races</button>
            <button type="button" aria-pressed={past} onClick={() => onModeChange("past")}>Past results</button>
          </div>
        )}
        {expanded && quickControls}
        {!past && !expanded && readinessLegend}
        {onExpandedChange && (
          <div className="em-map-actions">
            {expanded && onFullscreenToggle && (
              <button
                type="button"
                className="em-map-action"
                aria-pressed={fullscreen}
                title={fullscreen ? "Leave full screen (Esc)" : "Hide the browser's toolbars too"}
                onClick={onFullscreenToggle}
              >
                {fullscreen ? <Shrink aria-hidden="true" /> : <Expand aria-hidden="true" />}
                <span>{fullscreen ? "Leave full screen" : "Full screen"}</span>
              </button>
            )}
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
      {/* The stage wraps the map in both layouts so switching never remounts it. */}
      <div className="em-map-stage">
        {children}
        {expanded && (
          <div className="em-map-hud">
            <button type="button" className="em-map-action em-hud-toggle" aria-expanded={hudOpen} aria-controls="em-map-hud-body" onClick={() => setHudOpen(!hudOpen)}>
              <Layers aria-hidden="true" />
              {hudOpen ? "Hide legend" : "Show legend"}{hud ? " & data" : ""}
            </button>
            {hudOpen && (
              <div className="em-hud-body" id="em-map-hud-body">
                <div className="em-hud-card">{past ? pastLegend : readinessLegend}</div>
                {hud}
              </div>
            )}
          </div>
        )}
      </div>
      {past && !expanded && pastLegend}
      <div className="em-map-caption">
        <span>{past ? "Past results are from MIT Election Lab files and are never shown as 2026 counts." : "Readiness reflects data loaded into VoteInformed, not election outcomes."}</span>
        <span>{readout}</span>
      </div>
    </section>
  );
}
