import { MapPinned } from "lucide-react";
import type { MonitorResults } from "./types";

export function UnitsCard({ results, resultsAvailable, heading }: { results: MonitorResults | undefined; resultsAvailable: boolean; heading: string }) {
  return (
    <section className="em-card" aria-labelledby="em-units-heading">
      <h3 id="em-units-heading">{heading}</h3>
      <p>Reporting-unit progress as published by the results source. Split counties are never duplicated across districts.</p>
      {results && results.units.length > 0 ? (
        <div className="em-unit-list">
          {results.units.map((unit) => {
            const pct = unit.reported !== null && unit.total ? Math.round((unit.reported / unit.total) * 100) : null;
            return (
              <div className="em-unit-row" key={unit.id}>
                <span>{unit.name}</span>
                <span>{unit.reported ?? "?"}/{unit.total ?? "?"}</span>
                <strong>{pct === null ? "—" : `${pct}%`}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="em-empty">
          <MapPinned aria-hidden="true" />
          <strong>No county detail</strong>
          <span>{resultsAvailable ? "The results source has no reporting units for this contest." : "County detail requires a results provider, and none is connected yet."}</span>
        </div>
      )}
      {results?.meta.isMockData && <div className="em-note">Fictional mock data. Real county totals will appear only when an official or licensed source provides a district-specific breakdown.</div>}
    </section>
  );
}
