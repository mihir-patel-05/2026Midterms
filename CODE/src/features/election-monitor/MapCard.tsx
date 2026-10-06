import type { ReactNode } from "react";

const layerDescriptions = {
  states: "Select a state to inspect its federal contests",
  districts: "Congressional districts for the selected state",
  counties: "County reporting units where a results source provides them",
} as const;

export function MapCard({ layer, readout, children }: { layer: keyof typeof layerDescriptions; readout: string; children: ReactNode }) {
  return (
    <section className="em-map-card" aria-labelledby="em-map-heading">
      <div className="em-map-toolbar">
        <div>
          <strong id="em-map-heading">United States election map</strong>
          <span>{layerDescriptions[layer]}</span>
        </div>
        <div className="em-legend" aria-label="Data readiness legend">
          <span className="em-legend-item" data-readiness="ready"><i />Races on file</span>
          <span className="em-legend-item" data-readiness="partial"><i />No candidates yet</span>
          <span className="em-legend-item" data-readiness="pending"><i />No data</span>
          {layer === "districts" && <span className="em-legend-item" data-readiness="outdated"><i />2026 lines differ</span>}
        </div>
      </div>
      {children}
      <div className="em-map-caption">
        <span>Readiness reflects data loaded into VoteInformed, not election outcomes.</span>
        <span>{readout}</span>
      </div>
    </section>
  );
}
