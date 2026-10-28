import { useState, type CSSProperties } from "react";
import { BarChart3, CloudOff, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatEtTime } from "@/features/election-monitor/constants";
import {
  averageHeadline,
  emptyCopy,
  errorCopy,
  fieldDates,
  formatShare,
  marginLabel,
  partyShort,
  pollColumns,
  sampleDescription,
  sampleLabel,
  shareFor,
  shortDate,
  type PollColumn,
} from "./pollFormat";
import { PollsError, useRacePolls, type AverageCandidate, type PollAverage, type RacePolls as RacePollsData } from "./polls";
import "./polls.css";

const ROWS_SHOWN = 8;

/** Each party keeps one colour wherever it appears; unknown parties are neutral, never a borrowed hue. */
function partyColor(party: string | null) {
  const code = party?.toUpperCase() ?? "";
  if (code.startsWith("DEM")) return "hsl(var(--signal-blue))";
  if (code.startsWith("REP")) return "hsl(var(--signal-coral))";
  if (code.startsWith("IND")) return "hsl(var(--signal-purple))";
  if (code.startsWith("LIB")) return "hsl(var(--signal-amber))";
  if (code.startsWith("GR")) return "hsl(var(--signal-teal))";
  return "hsl(var(--quiet))";
}

function Empty({ icon: Icon, title, copy, spin }: { icon: typeof CloudOff; title: string; copy: string; spin?: boolean }) {
  return <div className="polls-empty"><Icon aria-hidden="true" className={spin ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>;
}

/** Last word of a name, for narrow column headings: "Sherrod Brown" → "Brown". */
const shortName = (name: string) => name.trim().split(/\s+/).pop() ?? name;

function AverageBars({ average, nameOf }: { average: PollAverage; nameOf: (candidate: AverageCandidate) => string }) {
  const headline = averageHeadline(average, nameOf);
  // One scale from 0 to the larger of 50% and the leader's share, so a 48 next to a 46 reads as close.
  const scaleMax = Math.max(50, ...average.candidates.map((candidate) => candidate.pct));
  return (
    <div className="polls-average">
      <div className="polls-head">
        <div className="polls-head-main">
          <span className="polls-eyebrow">Polling average</span>
          <strong className="polls-headline">{headline}</strong>
        </div>
        <span className="polls-sub">
          {average.pollsterCount} pollsters{average.newestEndDate ? ` · newest ended ${shortDate(average.newestEndDate)}` : ""}
        </span>
      </div>
      <ul className="polls-bars" aria-label="Polling average by candidate">
        {average.candidates.map((candidate) => {
          const name = nameOf(candidate);
          const party = partyShort(candidate.party);
          const label = `${name}${party ? ` (${party})` : ""}: ${candidate.pct.toFixed(1)}% average across ${candidate.polls} of ${average.pollsterCount} polls`;
          return (
            <Tooltip key={candidate.key}>
              <TooltipTrigger asChild>
                <li className="polls-bar-row" tabIndex={0} aria-label={label} style={{ "--party": partyColor(candidate.party) } as CSSProperties}>
                  <span className="polls-bar-name" aria-hidden="true">
                    <i className="polls-swatch" />
                    <span>{name}</span>
                    {party && <span className="polls-party">{party}</span>}
                  </span>
                  <span className="polls-track" aria-hidden="true">
                    <span className="polls-fill" style={{ width: `${(candidate.pct / scaleMax) * 100}%` }} />
                  </span>
                  <span className="polls-bar-value" aria-hidden="true">{candidate.pct.toFixed(1)}%</span>
                </li>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </ul>
    </div>
  );
}

function PollsTable({ data, columns, nameOf }: { data: RacePollsData; columns: PollColumn[]; nameOf: (column: PollColumn) => string }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? data.polls : data.polls.slice(0, ROWS_SHOWN);
  const averaged = data.average.status === "average";
  const year = new Date().getFullYear();
  return (
    <div className="polls-table-wrap">
      <table className="polls-table">
        <caption>
          <span className="polls-eyebrow">
            Recent polls{data.totalPolls > data.polls.length ? ` · newest ${data.polls.length} of ${data.totalPolls}` : ` · ${data.totalPolls}`}
          </span>
        </caption>
        <colgroup>
          <col className="polls-col-poll" />
          {columns.map((column) => <col key={column.key} className="polls-col-share" />)}
          {columns.length === 2 && <col className="polls-col-margin" />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Pollster<span className="sr-only">, field dates, and sample</span></th>
            {columns.map((column) => {
              const party = partyShort(column.party);
              return <th key={column.key} scope="col" title={`${nameOf(column)}${party ? ` (${party})` : ""}`}>{shortName(nameOf(column))}</th>;
            })}
            {columns.length === 2 && <th scope="col">Margin</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((poll) => {
            const shares = columns.map((column) => shareFor(poll, column.key));
            const outOfAverage = averaged && !poll.inAverage;
            return (
              <tr key={poll.id} className={outOfAverage ? "polls-row-out" : undefined}>
                <td>
                  {poll.url
                    ? <a className="polls-pollster" href={poll.url} target="_blank" rel="noopener noreferrer" title={poll.pollster}>{poll.pollster}<span className="sr-only"> (opens the poll release)</span></a>
                    : <span className="polls-pollster" title={poll.pollster}>{poll.pollster}</span>}
                  <span className="polls-meta" title={`${fieldDates(poll.startDate, poll.endDate)}, ${sampleDescription(poll)}`}>
                    {fieldDates(poll.startDate, poll.endDate, year)} · {sampleLabel(poll)}
                  </span>
                  {poll.sponsors.length > 0 && <span className="polls-meta" title={`For ${poll.sponsors.join(", ")}`}>for {poll.sponsors.join(", ")}</span>}
                  {(poll.isInternal || outOfAverage) && (
                    <span className="polls-tags">
                      {poll.isInternal && <span className="polls-tag" title="Released by a campaign or party; left out of the average">Internal</span>}
                      {outOfAverage && !poll.isInternal && <span className="polls-tag" title="An older poll from a pollster already in the average, or older than the window">Not in average</span>}
                    </span>
                  )}
                </td>
                {shares.map((share, index) => <td key={columns[index].key}>{formatShare(share)}</td>)}
                {columns.length === 2 && <td className="polls-margin">{marginLabel(columns, shares, (column) => shortName(nameOf(column))) ?? "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.polls.length > ROWS_SHOWN && (
        <button type="button" className="polls-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer polls" : `Show all ${data.polls.length} polls`}
        </button>
      )}
    </div>
  );
}

/**
 * A race's polling average and recent polls, from GET /api/polls. Missing data
 * has its own state (no polling, too few polls, only old polls, not connected),
 * never a 0 or a 50/50. `candidateNames` maps FEC IDs to the names shown
 * elsewhere on the page, since pollsters often give surnames only.
 */
export function RacePolls({ race, candidateNames }: { race: string | null; candidateNames?: Record<string, string> }) {
  const query = useRacePolls(race);

  if (!race) return <Empty icon={BarChart3} title="No polls for this contest" copy="Polls are tracked for U.S. Senate and House races with a known district." />;
  if (query.isLoading) return <Empty icon={Loader2} spin title="Loading polls" copy="Fetching published polls for this race." />;
  if (query.isError || !query.data) {
    const { title, copy } = errorCopy(query.error instanceof PollsError ? query.error.code : "UNAVAILABLE");
    return <Empty icon={CloudOff} title={title} copy={copy} />;
  }

  const data = query.data;
  const nameOf = (item: { candidateFecId?: string | null; key: string; name: string }) => {
    const fecId = item.candidateFecId ?? (item.key.startsWith("name:") ? null : item.key);
    return (fecId && candidateNames?.[fecId]) || item.name;
  };
  const columns = pollColumns(data.polls, data.average);
  const empty = data.average.status === "average" ? null : emptyCopy(data.average, data.totalPolls);

  return (
    <div className="polls" aria-busy={query.isFetching}>
      {empty ? <Empty icon={BarChart3} title={empty.title} copy={empty.copy} /> : <AverageBars average={data.average} nameOf={nameOf} />}
      {data.polls.length > 0 && <PollsTable data={data} columns={columns} nameOf={nameOf} />}
      <p className="polls-source">
        {data.average.status === "average" && (
          <>Average of each pollster&apos;s newest poll ending in the last {data.average.windowDays} days, weighted by sample size and recency. Campaign internals and undecided voters are left out (method {data.average.method}). </>
        )}
        Polls via <a href={data.source.homepageUrl} target="_blank" rel="noopener noreferrer">{data.source.name}</a>, licensed{" "}
        <a href={data.source.licenseUrl} target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
        {data.source.lastSyncedAt ? `. Synced ${shortDate(data.source.lastSyncedAt)}, ${formatEtTime(data.source.lastSyncedAt)} ET.` : "."}
        {" "}Polls are snapshots of opinion, not forecasts or results.
      </p>
    </div>
  );
}
