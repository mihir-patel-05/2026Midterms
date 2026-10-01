import type { SourceStatusContract } from "@/features/election-dashboard/types";
import { formatEtTime } from "./constants";
import type { MonitorResults } from "./types";

interface HistoryRow {
  at: string;
  title: string;
  detail: string;
}

/**
 * Timeline built only from timestamps the results source actually reports.
 * Corrections are retained server-side; this lists what the API exposes.
 */
export function HistoryCard({ results, sources }: { results: MonitorResults; sources: SourceStatusContract[] | undefined }) {
  const source = sources?.find((item) => item.providerKey === results.meta.source.providerKey) ?? results.meta.source;
  const rows: HistoryRow[] = [
    { at: results.updatedAt, title: "Result snapshot published", detail: `${results.status.toLowerCase().replace("_", " ")} · ${results.certificationState.toLowerCase().replace("_", " ")}` },
    { at: source.lastCheckedAt, title: "Source checked", detail: `${source.name} · health ${source.health.toLowerCase().replace("_", " ")}` },
    ...(source.lastSuccessfulAt ? [{ at: source.lastSuccessfulAt, title: "Last successful fetch", detail: source.message ?? "Validated and stored" }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="em-card" aria-labelledby="em-history-heading">
      <h3 id="em-history-heading">Snapshot history</h3>
      <p>Corrections are retained rather than overwriting earlier snapshots.</p>
      <ol className="em-timeline">
        {rows.map((row) => (
          <li className="em-timeline-row" key={`${row.title}-${row.at}`}>
            <time dateTime={row.at}>{formatEtTime(row.at, true)}</time>
            <div className="em-timeline-copy"><strong>{row.title}</strong><span>{row.detail}</span></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
