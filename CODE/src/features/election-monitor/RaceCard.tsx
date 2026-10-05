import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CloudOff, Loader2, Vote } from "lucide-react";
import { districtLabel, initials, numberFormat, officeLabels, partyTone } from "./constants";
import type { MonitorContest, MonitorResults } from "./types";

const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

function fundingLine(receipts: number | null | undefined, cashOnHand: number | null | undefined) {
  if (receipts === null || receipts === undefined) return null;
  if (receipts === 0) return "No FEC receipts reported";
  return `Raised ${compactMoney.format(receipts)}${cashOnHand !== null && cashOnHand !== undefined ? ` · ${compactMoney.format(cashOnHand)} cash on hand` : ""}`;
}

function contestHeading(contest: MonitorContest) {
  if (contest.isFictional) return contest.title;
  return contest.office === "US_HOUSE" ? `${officeLabels.US_HOUSE} · ${districtLabel(contest.stateCode, contest.district)}` : `${officeLabels[contest.office]} · ${contest.stateCode}`;
}

export function RaceCard({
  contests,
  contest,
  results,
  resultsAvailable,
  loading,
  error,
  hasState,
  onSelectContest,
}: {
  contests: MonitorContest[];
  contest: MonitorContest | undefined;
  results: MonitorResults | undefined;
  /** False when no results provider is configured at all. */
  resultsAvailable: boolean;
  loading: boolean;
  error: boolean;
  hasState: boolean;
  onSelectContest: (id: string) => void;
}) {
  if (!contest) {
    const [Icon, title, copy] = loading
      ? [Loader2, "Loading contests", "Fetching this state's federal contests."]
      : error
        ? [CloudOff, "Contests unavailable", "The elections API could not be reached. Nothing is shown rather than guessing."]
        : hasState
          ? [Vote, "No contests match", "No general-election contests on file match these filters."]
          : [Vote, "No state selected", "Pick a state on the map or in the Location selector to see its federal contests."];
    return (
      <section className="em-card" aria-live="polite">
        <div className="em-empty"><Icon aria-hidden="true" className={loading ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>
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
        const funding = fundingLine(candidate.receipts, candidate.cashOnHand);
        const name = (
          <span>
            <strong>{candidate.name}</strong>
            <span>{candidate.party ?? "No party listed"}{candidate.isIncumbent ? " · incumbent" : ""}{candidate.ballotStatus === "UNCONFIRMED" ? " · ballot unconfirmed" : ""}</span>
            {funding && <span>{funding}</span>}
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
