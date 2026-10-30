import { useState, type ReactNode } from "react";
import { Expand, Layers, Maximize2, Minimize2, Shrink } from "lucide-react";
import type { MapMode } from "./types";

const layerDescriptions = {
  states: "Select a state to inspect its federal contests",
  districts: "Congressional districts for the selected state",
  counties: "County reporting units where a results source provides them",
} as const;
const modeLabels: Record<MapMode, string> = { races: "2026 races", past: "Past results", odds: "Market odds", census: "Census" };
const modeDescriptions: Partial<Record<MapMode, string>> = {
  past: "How states, districts, and counties voted in past elections",
  odds: "Which way each race's Kalshi market leans, and how strongly",
  census: "Who lives in each state, district, and county, from the American Community Survey",
};
const modeCaptions: Record<MapMode, string> = {
  races: "Readiness reflects data loaded into VoteInformed, not election outcomes.",
  past: "Past results are from MIT Election Lab files and are never shown as 2026 counts.",
  odds: "Market prices from Kalshi, not forecasts or results.",
  census: "Census estimates describe an area's residents, not how it votes.",
};

export function MapCard({ layer, readout, children, mode = "races", modes = [], onModeChange, modeControls, modeLegend, expanded = false, onExpandedChange, fullscreen = false, onFullscreenToggle, quickControls, actions, hud }: {
  layer: keyof typeof layerDescriptions;
  readout: string;
  children: ReactNode;
  mode?: MapMode;
  /** Modes offered besides "races"; the switch is hidden when their feature flags leave none. */
  modes?: Array<Exclude<MapMode, "races">>;
  onModeChange?: (mode: MapMode) => void;
  /** Options and legend for the current mode other than "races". */
  modeControls?: ReactNode;
  modeLegend?: ReactNode;
  /** The map fills the window; the toolbar button switches it. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Browser fullscreen, offered once expanded; omitted where the browser can't do it. */
  fullscreen?: boolean;
  onFullscreenToggle?: () => void;
  /** Location and layer pickers, shown in the toolbar while expanded (the sidebar is hidden then). */
  quickControls?: ReactNode;
  /** Extra toolbar buttons shown in both layouts, before expand and full screen (e.g. Simulate). */
  actions?: ReactNode;
  /** Data that floats over the expanded map, under the legend. */
  hud?: ReactNode;
}) {
  const overlay = mode !== "races";
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
          <span>{modeDescriptions[mode] ?? layerDescriptions[layer]}</span>
        </div>
        {onModeChange && modes.length > 0 && (
          <div className="em-seg em-mode" role="group" aria-label="Map mode">
            {(["races", ...modes] as MapMode[]).map((item) => (
              <button key={item} type="button" aria-pressed={item === mode} onClick={() => onModeChange(item)}>{modeLabels[item]}</button>
            ))}
          </div>
        )}
        {expanded && quickControls}
        {!overlay && !expanded && readinessLegend}
        {(onExpandedChange || actions) && (
          <div className="em-map-actions">
            {actions}
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
            {onExpandedChange && (
              <button
                type="button"
                className="em-map-action"
                aria-pressed={expanded}
                title={expanded ? "Switch to the scrolling dashboard with filters, activity and markets" : "Fill the window with the map"}
                onClick={() => onExpandedChange(!expanded)}
              >
                {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                <span>{expanded ? "Dashboard" : "Full map"}<span className="sr-only"> view</span></span>
              </button>
            )}
          </div>
        )}
      </div>
      {overlay && modeControls}
      {/* The stage wraps the map in both layouts so switching never remounts it. */}
      <div className="em-map-stage">
        {children}
        {expanded && (
          <div className="em-map-hud">
            <button type="button" className="em-map-action em-hud-toggle" aria-expanded={hudOpen} aria-controls="em-map-hud-body" onClick={() => setHudOpen(!hudOpen)}>
              <Layers aria-hidden="true" />
              {hudOpen ? "Hide legend" : "Show legend"}{hud ? " & stats" : ""}
            </button>
            {hudOpen && (
              <div className="em-hud-body" id="em-map-hud-body">
                <div className="em-hud-card">{overlay ? modeLegend : readinessLegend}</div>
                {hud}
              </div>
            )}
          </div>
        )}
      </div>
      {overlay && !expanded && modeLegend}
      <div className="em-map-caption">
        <span>{modeCaptions[mode]}</span>
        <span>{readout}</span>
      </div>
    </section>
  );
}
