import { etDate, etHourMinute } from "../countdown";
import { Panel, StatusLine } from "../panels/Panel";
import type { LogEntry } from "./dossier";

/** The race's dated events from its sources, newest first. */
export function RaceLogPanel({ id, entries, loading }: { id: string; entries: LogEntry[]; loading: boolean }) {
  return (
    <Panel id={id} flush title="Race log" meta="ET">
      {entries.length === 0 ? <StatusLine>{loading ? "Loading…" : "Nothing logged for this race yet"}</StatusLine> : (
        <ol className="wr-log">
          {entries.map((entry) => (
            <li key={`${entry.title}-${entry.at}`}>
              <time dateTime={new Date(entry.at).toISOString()}>{etDate(entry.at)}{entry.dateOnly ? "" : ` ${etHourMinute(entry.at)}`}</time>
              <span className="wr-log-dot" data-tone={entry.tone} aria-hidden="true" />
              <span><strong>{entry.title}</strong> {entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
