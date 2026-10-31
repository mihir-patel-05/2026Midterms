import { fieldDates, sampleLabel, shortDate } from "@/features/polls/pollFormat";
import { useNationalPolls, type NationalPoll } from "@/features/polls/nationalPolls";
import { PollsError } from "@/features/polls/polls";
import { swingLabel } from "../labels";
import { formatMargin } from "../model";
import { HOUSE_2024_MARGIN, nationalSwings, PRESIDENT_2024_MARGIN, type ImpliedSwing } from "./nationalBaseline";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A newest poll older than this gets an age warning. */
const OLD_AFTER_DAYS = 14;

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
const pct = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)}%`);
const daysOld = (date: string, asOf: string) => Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);

/** "2 pollsters in the last 30 days", or why there is no average. */
function averageNote(series: { status: string; pollsterCount: number; windowDays: number }) {
  if (series.status === "average") return `Average of ${series.pollsterCount} pollsters, last ${series.windowDays} days`;
  if (series.status === "too_few") return `One pollster in the last ${series.windowDays} days: too few to average`;
  if (series.status === "stale") return `No polls in the last ${series.windowDays} days`;
  return "No public polling";
}

function RecentPolls({ polls, columns, label }: { polls: NationalPoll[]; columns: Array<[string, RegExp]>; label: string }) {
  if (polls.length === 0) return null;
  const year = new Date().getUTCFullYear();
  return (
    <details className="sim-national-polls">
      <summary>Newest {label} polls</summary>
      <table className="sim-table">
        <thead>
          <tr>
            <th scope="col">Pollster</th>
            <th scope="col">Dates</th>
            <th scope="col">Sample</th>
            {columns.map(([name]) => <th key={name} scope="col">{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {polls.map((poll) => (
            <tr key={poll.id}>
              <th scope="row">
                {poll.url ? <a className="sim-link" href={poll.url} target="_blank" rel="noreferrer">{poll.pollster}</a> : poll.pollster}
                {!poll.inAverage && <small>{poll.partisan ? `${poll.partisan === "DEM" ? "Democratic" : poll.partisan === "REP" ? "Republican" : "Party"}-sponsored; not averaged` : "not in the average"}</small>}
              </th>
              <td>{fieldDates(poll.startDate, poll.endDate, year)}</td>
              <td>{sampleLabel(poll)}</td>
              {columns.map(([name, pattern]) => <td key={name}>{pct(poll.answers.find((answer) => pattern.test(answer.choice))?.pct ?? null)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function SwingRow({ label, baseline, implied, disabledReason, onApply }: {
  label: string;
  baseline: string;
  implied: ImpliedSwing;
  /** Why the swing can't be applied to this map right now, or null. */
  disabledReason: string | null;
  onApply: (swing: number) => void;
}) {
  return (
    <div className="sim-national-swing">
      <div>
        <strong data-party={implied.swing > 0 ? "D" : implied.swing < 0 ? "R" : "T"}>{swingLabel(implied.swing)}</strong>
        <small>{label}, against {baseline}{implied.capped ? `; the slider stops at ${swingLabel(implied.slider)}` : ""}</small>
      </div>
      <button type="button" className="sim-button" disabled={disabledReason !== null} title={disabledReason ?? undefined} onClick={() => onApply(implied.slider)}>
        Use {implied.slider === implied.swing ? "it" : swingLabel(implied.slider)}
      </button>
    </div>
  );
}

/**
 * The national environment the scenario starts from: presidential approval, the generic
 * congressional ballot, and the uniform swing the ballot implies for each map, with buttons that
 * set the map's swing to it. The numbers come from the API's VoteHub averages; the swings are
 * computed here from the 2024 baselines in nationalBaseline.ts.
 */
export function NationalBaseline({ senateBase, houseBase, onApplySenate, onApplyHouse }: {
  /** The Senate map's baseline year (null on a blank map); the swing is measured against 2024. */
  senateBase: number | null;
  houseBase: number | null;
  onApplySenate: (swing: number) => void;
  onApplyHouse: (swing: number) => void;
}) {
  const { data, error, isLoading } = useNationalPolls();
  if (error instanceof PollsError && error.code === "DISABLED") return null;

  return (
    <section className="sim-card sim-national" aria-labelledby="sim-national-heading">
      <div className="sim-card-head">
        <h2 id="sim-national-heading">National environment</h2>
        {data && <span>Polls through {shortDate(data.approval.newestEndDate ?? data.genericBallot.newestEndDate ?? data.asOf)}</span>}
      </div>
      {isLoading && <p className="sim-note">Loading the latest national polls…</p>}
      {error && !data && <p className="sim-note">National polls are unavailable right now. You can still set the swings by hand.</p>}
      {data && (() => {
        const { approval, genericBallot: ballot } = data;
        const swings = ballot.margin === null ? null : nationalSwings(ballot.margin);
        const newest = [approval.newestEndDate, ballot.newestEndDate].filter((date): date is string => Boolean(date)).sort().at(-1);
        const age = newest ? daysOld(newest, data.asOf) : null;
        return (
          <>
            <div className="sim-national-grid">
              <div className="sim-national-stat">
                <span className="sim-national-label">Presidential approval</span>
                {approval.net !== null ? (
                  <>
                    <strong>Net {signed(approval.net)}</strong>
                    <small>{pct(approval.approve)} approve · {pct(approval.disapprove)} disapprove of {approval.subject}</small>
                  </>
                ) : <strong data-party="T">No average</strong>}
                <small>{averageNote(approval)}</small>
              </div>
              <div className="sim-national-stat">
                <span className="sim-national-label">Generic congressional ballot</span>
                {ballot.margin !== null ? (
                  <>
                    <strong data-party={ballot.margin > 0 ? "D" : ballot.margin < 0 ? "R" : "T"}>{formatMargin(ballot.margin)}</strong>
                    <small>Democrats {pct(ballot.dem)} · Republicans {pct(ballot.rep)}</small>
                  </>
                ) : <strong data-party="T">No average</strong>}
                <small>{averageNote(ballot)}</small>
              </div>
              <div className="sim-national-stat">
                <span className="sim-national-label">Swing it implies</span>
                {swings ? (
                  <>
                    <SwingRow
                      label="Senate"
                      baseline={`the 2024 presidential vote (${formatMargin(PRESIDENT_2024_MARGIN)})`}
                      implied={swings.senate}
                      disabledReason={senateBase === 2024 ? null : "Start the Senate map from 2024 results to use this swing"}
                      onApply={onApplySenate}
                    />
                    <SwingRow
                      label="House"
                      baseline={`the 2024 House vote (${formatMargin(HOUSE_2024_MARGIN)})`}
                      implied={swings.house}
                      disabledReason={houseBase === null ? "Start the House map from 2024 winners to use this swing" : null}
                      onApply={onApplyHouse}
                    />
                  </>
                ) : <small>Needs a generic ballot average.</small>}
              </div>
            </div>
            {age !== null && age > OLD_AFTER_DAYS && (
              <p className="sim-note sim-national-warning" role="status">The newest national poll VoteHub lists ended {age} days ago, so these averages may not reflect the latest movement.</p>
            )}
            <p className="sim-note">
              No pollster asks a separate Senate generic ballot, so both swings come from the congressional ballot, which asks about the House.
              A swing is the ballot's margin minus that map's 2024 margin, applied the same in every state or district. It is a starting point, not a forecast.
            </p>
            <RecentPolls polls={approval.recent} label="approval" columns={[["Approve", /^approve$/i], ["Disapprove", /^disapprove$/i]]} />
            <RecentPolls polls={ballot.recent} label="generic ballot" columns={[["Dem", /^dem/i], ["Rep", /^rep/i]]} />
            <p className="sim-source">
              <a className="sim-link" href={data.source.homepageUrl} target="_blank" rel="noreferrer">Polls via VoteHub</a>, licensed{" "}
              <a className="sim-link" href={data.source.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>. Averages: newest poll per pollster in
              the last {approval.windowDays} days, weighted by sample size and recency ({data.method}); party-sponsored polls left out. Read{" "}
              {new Date(data.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
            </p>
          </>
        );
      })()}
    </section>
  );
}
