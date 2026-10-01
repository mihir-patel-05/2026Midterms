import { formatEtTime } from "./constants";
import type { MonitorResults } from "./types";

const lower = (value: string) => value.toLowerCase().replace(/_/g, " ");

/** States report different units and progress measures; spell out what this snapshot means. */
export function SemanticsCard({ results }: { results: MonitorResults }) {
  const unitTypes = [...new Set(results.units.map((unit) => lower(unit.type)))];
  return (
    <section className="em-card" aria-labelledby="em-semantics-heading">
      <h3 id="em-semantics-heading">Result semantics</h3>
      <p>How to read this snapshot. Each state can expose different reporting units and progress measures.</p>
      <dl className="em-metrics">
        <div className="em-metric"><dt>Status</dt><dd>{lower(results.certificationState)}</dd></div>
        <div className="em-metric"><dt>Unit type</dt><dd>{unitTypes.join(", ") || "—"}</dd></div>
        <div className="em-metric"><dt>Source time</dt><dd>{formatEtTime(results.updatedAt)} ET</dd></div>
        <div className="em-metric"><dt>Freshness</dt><dd>{lower(results.meta.freshness)}</dd></div>
        <div className="em-metric"><dt>Coverage</dt><dd>{lower(results.meta.coverage)}</dd></div>
        <div className="em-metric"><dt>Source</dt><dd title={results.meta.source.name}>{results.meta.source.isMock ? "Mock fixture" : results.meta.source.name}</dd></div>
      </dl>
      {results.meta.limitations.length > 0 && (
        <ul className="em-limitations">
          {results.meta.limitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </section>
  );
}
