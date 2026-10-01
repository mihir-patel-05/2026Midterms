import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Vote } from "lucide-react";
import { districtLabel, initials, numberFormat, officeLabels, partyTone } from "./constants";
import type { MonitorContest, MonitorResults } from "./types";

function contestHeading(contest: MonitorContest) {
  if (contest.isFictional) return contest.title;
  return contest.office === "US_HOUSE" ? `${officeLabels.US_HOUSE} · ${districtLabel(contest.stateCode, contest.district)}` : `${officeLabels[contest.office]} · ${contest.stateCode}`;
}

export function RaceCard({
  contests,
  contest,
  results,
  resultsAvailable,
  onSelectContest,
}: {
  contests: MonitorContest[];
  contest: MonitorContest | undefined;
  results: MonitorResults | undefined;
  /** False when no results provider is configured at all. */
  resultsAvailable: boolean;
  onSelectContest: (id: string) => void;
}) {
  if (!contest) {
    return (
      <section className="em-card">
        <div className="em-empty"><Vote aria-hidden="true" /><strong>No contest selected</strong><span>Pick a state on the map or in the sidebar to see its federal contests.</span></div>
      </section>
    );
  }

  const resultById = new Map(results?.candidates.map((item) => [item.candidateId, item]));
  const ordered = results
    ? [...contest.candidates].sort((a, b) => (resultById.get(b.id)?.votes ?? -1) - (resultById.get(a.id)?.votes ?? -1))
    : contest.candidates;

  return (
    <section className="em-card" aria-labelledby="em-race-heading">
      {contests.length > 1 && (
        <div className="em-race-list" role="group" aria-label="Contests in this view">
          {contests.slice(0, 8).map((item) => (
            <button key={item.id} type="button" className="em-race-option" aria-pressed={item.id === contest.id} onClick={() => onSelectContest(item.id)}>
              <span>{contestHeading(item)}</span>
              <small>{item.candidates.length} cand.</small>
            </button>
          ))}
          {contests.length > 8 && <small className="em-eyebrow">+{contests.length - 8} more · narrow with the district filter</small>}
        </div>
      )}

      <div className="em-race-title">
        <div>
          <span className="em-eyebrow">{officeLabels[contest.office]}{contest.district ? ` · District ${contest.district === "00" ? "at-large" : contest.district}` : ""}</span>
          <h3 id="em-race-heading">{contestHeading(contest)}</h3>
        </div>
        {results
          ? <span className="em-pill" data-tone="amber">{contest.isFictional ? "Mock " : ""}{results.certificationState.toLowerCase().replace("_", " ")}</span>
          : <span className="em-pill" data-tone="muted">{contest.electionType.toLowerCase()}</span>}
      </div>

      {ordered.length === 0 ? (
        <p className="em-empty">No candidates are on file for this contest yet.</p>
      ) : ordered.map((candidate, index) => {
        const tone = partyTone(candidate.party, index);
        const result = resultById.get(candidate.id);
        const name = (
          <span>
            <strong>{candidate.name}</strong>
            <span>{candidate.party ?? "No party listed"}{candidate.isIncumbent ? " · incumbent" : ""}{candidate.ballotStatus === "UNCONFIRMED" ? " · ballot unconfirmed" : ""}</span>
          </span>
        );
        return (
          <div className="em-candidate" key={candidate.id}>
            <div className="em-candidate-line">
              <div className="em-candidate-name">
                <span className="em-avatar" style={{ "--avatar-bg": tone.bg, "--avatar-fg": tone.fg } as CSSProperties} aria-hidden="true">{initials(candidate.name)}</span>
                {candidate.profileId ? <Link to={`/candidates/${candidate.profileId}`}>{name}</Link> : name}
              </div>
              {result && (
                <div className="em-candidate-total">
                  <strong>{result.percentage.toFixed(1)}%</strong>
                  <span>{numberFormat.format(result.votes)} votes</span>
                </div>
              )}
            </div>
            {result && (
              <div className="em-result-bar" aria-hidden="true">
                <span style={{ "--width": `${result.percentage}%`, "--color": tone.fg } as CSSProperties} />
              </div>
            )}
          </div>
        );
      })}

      {results ? (
        <div className="em-reporting-line">
          <span>{results.reportingPercent === null ? "Reporting progress unknown" : `${results.reportingPercent.toFixed(1)}% of precincts reporting`}</span>
          <strong>{numberFormat.format(results.totalVotes)} votes</strong>
        </div>
      ) : (
        <div className="em-reporting-line">
          <span>{resultsAvailable ? "No results snapshot for this contest" : "No results provider connected"}</span>
          <span>{contest.electionDate ? new Date(`${contest.electionDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
        </div>
      )}
    </section>
  );
}
