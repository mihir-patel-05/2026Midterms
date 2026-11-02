import { formatEtTime, numberFormat } from "@/features/election-monitor/constants";
import { liveResultsEnabled } from "@/lib/featureFlags";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { partyColor, partyLetter } from "../party";
import { raceState } from "../raceCodes";
import { leaderOf, progressLabel, type LiveRace } from "./liveResults";
import { useOfficialLinks } from "./officialLinks";
import { useContestDetail, useLiveResults } from "./useLiveResults";
import { useWarRoomFlags } from "../flags";
import { useCallTracker } from "./callTracker";
import { INDEPENDENT_CAUCUS, majorityRuleFor, majorityStatus } from "./nightExtras";

const pct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function CallLine({ race }: { race: LiveRace }) {
  const flags = useWarRoomFlags();
  const tracker = useCallTracker().tracker;
  const call = race.calls.find((item) => item.kind === "WINNER");
  const winner = race.winner;
  if (call && winner) {
    return (
      <p className="wr-results-call">
        <Badge tone="live">Called</Badge> <strong style={{ color: partyColor(winner.party) }}>{winner.name}</strong> ({winner.partyName ?? "no party"}) · {call.calledBy}, {formatEtTime(call.calledAt)} ET{call.calledAtIsSourceTime ? "" : " (first seen)"}
      </p>
    );
  }
  const runoff = race.calls.filter((item) => item.kind === "ADVANCED");
  if (runoff.length) {
    const names = runoff.map((item) => race.candidates.find((candidate) => candidate.id === item.candidateId)?.name).filter(Boolean);
    return <p className="wr-results-call"><Badge tone="accent">Runoff</Badge> {names.join(" and ")} advance · {runoff[0].calledBy}</p>;
  }
  const leader = leaderOf(race);
  const retracted = flags.retracted_calls ? tracker?.retractions.find((item) => item.code === race.code) : undefined;
  const majority = flags.runoff_labels ? majorityStatus(race) : null;
  if (leader && majority?.kind === "under-majority") {
    return (
      <p className="wr-results-call">
        <Badge>Not called</Badge> {leader.name} leads with {pct.format(leader.pct)}%, under 50% so far.
        {retracted && <> <Badge tone="accent">Call retracted</Badge> {retracted.calledBy} withdrew its call for {retracted.name} ({formatEtTime(new Date(retracted.noticedAt).toISOString())} ET, first seen).</>}
      </p>
    );
  }
  return <p className="wr-results-call">{retracted && <><Badge tone="accent">Call retracted</Badge> {retracted.calledBy} withdrew its call for {retracted.name} ({formatEtTime(new Date(retracted.noticedAt).toISOString())} ET, first seen). </>}{leader ? <><Badge>Not called</Badge> {leader.name} leads in the count so far</> : <><Badge tone="off">No votes yet</Badge> No votes counted</>}</p>;
}

/** Standing notes for a race: its majority rule, and an independent's caucus plans. */
function RaceNotes({ code }: { code: string }) {
  const flags = useWarRoomFlags();
  const rule = flags.runoff_labels ? majorityRuleFor(code) : null;
  const caucus = flags.caucus_note ? INDEPENDENT_CAUCUS[code] : undefined;
  if (!rule && !caucus) return null;
  return (
    <>
      {rule && <p className="wr-seats-note">{rule.text}</p>}
      {caucus && <p className="wr-seats-note">{caucus.note}</p>}
    </>
  );
}

/** The dossier's results section: the count, the decision desk's call, and counties for races with county detail. */
export function RaceResultsPanel({ code, id }: { code: string; id?: string }) {
  const results = useLiveResults();
  const links = useOfficialLinks();
  const race = results.kind === "ready" ? results.board.races.get(code) : undefined;
  const detail = useContestDetail(race?.contestId ?? null);
  const official = links.data?.states[raceState(code)];
  if (!liveResultsEnabled) return null;
  const officialLink = official && <a className="wr-btn" href={official.url} target="_blank" rel="noreferrer">Official results · {official.office} ↗</a>;

  if (results.kind !== "ready") {
    const text = results.kind === "loading" ? "Loading results…"
      : results.kind === "switched-off" ? "The results source is switched off."
        : results.kind === "unavailable" ? "Results are temporarily unavailable."
          : "No results source is connected yet.";
    return (
      <Panel id={id} title="Results" meta={<Badge tone="off">{results.kind === "loading" ? "Loading" : "Not available"}</Badge>}>
        <StatusLine>{text}</StatusLine>
        {officialLink}
      </Panel>
    );
  }
  const { board } = results;
  if (!race) {
    return (
      <Panel id={id} title={`Results · ${board.source.name}`} meta={<Badge tone="off">No result yet</Badge>} footnote={board.attribution}>
        <StatusLine>{board.source.name} has no numbers for this race yet{board.source.health === "NOT_CONFIGURED" ? ` (${board.source.message ?? "waiting for live data"})` : ""}.</StatusLine>
        {officialLink}
      </Panel>
    );
  }
  const max = Math.max(...race.candidates.map((candidate) => candidate.pct), 1);
  const counties = detail.data?.counties ?? [];
  const names = new Map(race.candidates.map((candidate) => [candidate.id, candidate]));
  return (
    <Panel id={id} title={`Results · ${board.source.name}`} meta={race.isTestData ? <Badge tone="mock">Test data · not results</Badge> : <Badge tone="live">Unofficial count</Badge>}
      footnote={`${board.attribution} · Calls are decision desk projections, not certified results`}>
      {race.isTestData && <p className="wr-results-test"><strong>Test data</strong> Rehearsal numbers, not election results.</p>}
      <CallLine race={race} />
      <RaceNotes code={code} />
      <ul className="wr-results-cands">
        {race.candidates.map((candidate) => (
          <li key={candidate.id}>
            <span><strong style={{ color: partyColor(candidate.party) }}>{candidate.name}</strong> <span className="wr-dim">{candidate.partyName ?? "No party"}{candidate.isIncumbent ? " · incumbent" : ""}</span></span>
            <span className="wr-num">{numberFormat.format(candidate.votes)} · {pct.format(candidate.pct)}%</span>
            <span className="wr-votebar" aria-hidden="true"><span style={{ width: `${(candidate.pct / max) * 100}%`, background: partyColor(candidate.party) }} /></span>
          </li>
        ))}
      </ul>
      <p className="wr-results-meta">
        <span>{progressLabel(race)}</span>
        <span>{numberFormat.format(race.totalVotes)} votes</span>
        {race.marginPts !== null && <span>Margin {pct.format(race.marginPts)} pts</span>}
        <span>As of {formatEtTime(race.updatedAt)} ET</span>
      </p>
      {counties.length > 0 && (
        <details className="wr-results-counties-wrap" open={counties.length <= 12}>
          <summary className="wr-official">Counties · {counties.length}</summary>
          <div className="wr-table-wrap wr-results-counties">
            <table className="wr-table">
              <thead><tr><th scope="col">County</th><th scope="col">Leading</th><th scope="col" className="wr-num">Counted</th><th scope="col" className="wr-num">Votes</th></tr></thead>
              <tbody>
                {counties.map((county) => {
                  const top = [...county.candidates].sort((a, b) => b.votes - a.votes)[0];
                  const leader = top && top.votes > 0 ? names.get(top.candidateId) : undefined;
                  return (
                    <tr key={county.fips ?? county.name}>
                      <td>{county.name}</td>
                      <td style={{ color: leader ? partyColor(leader.party) : undefined }}>{leader ? `${partyLetter(leader.party)} ${leader.name.split(/\s+/).pop()} ${pct.format(top.pct)}%` : "—"}</td>
                      <td className="wr-num">{county.pctCounted === null ? "—" : `~${Math.round(county.pctCounted)}%`}</td>
                      <td className="wr-num">{numberFormat.format(county.totalVotes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {detail.data && counties.length === 0 && <p className="wr-dim">County detail is kept for the closest races only; this race shows {board.source.name}'s race totals.</p>}
      {officialLink}
    </Panel>
  );
}
