import type { MonitorContest } from "./types";

/** Compact factual totals for the selected state, computed from contests on file. */
export function SnapshotCard({ stateName, contests }: { stateName: string; contests: MonitorContest[] }) {
  const house = contests.filter((contest) => contest.office === "US_HOUSE");
  const senate = contests.filter((contest) => contest.office === "US_SENATE");
  const candidates = contests.reduce((sum, contest) => sum + contest.candidates.length, 0);
  const incumbents = contests.reduce((sum, contest) => sum + contest.candidates.filter((candidate) => candidate.isIncumbent).length, 0);
  const openSeats = contests.filter((contest) => contest.candidates.length > 0 && !contest.candidates.some((candidate) => candidate.isIncumbent)).length;

  return (
    <section className="em-card" aria-labelledby="em-snapshot-heading">
      <h3 id="em-snapshot-heading">Statewide snapshot</h3>
      <p>Federal contests on file for {stateName}.</p>
      <dl className="em-metrics">
        <div className="em-metric"><dt>House contests</dt><dd>{house.length}</dd></div>
        <div className="em-metric"><dt>Senate contests</dt><dd>{senate.length}</dd></div>
        <div className="em-metric"><dt>Candidates on file</dt><dd>{candidates}</dd></div>
        <div className="em-metric"><dt>Open seats</dt><dd>{openSeats}</dd></div>
        <div className="em-metric"><dt>Incumbents running</dt><dd>{incumbents}</dd></div>
        <div className="em-metric"><dt>Ballot unconfirmed</dt><dd>{contests.reduce((sum, contest) => sum + contest.candidates.filter((candidate) => candidate.ballotStatus === "UNCONFIRMED").length, 0)}</dd></div>
      </dl>
    </section>
  );
}
