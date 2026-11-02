import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatEtTime, numberFormat } from "@/features/election-monitor/constants";
import { HOUSE_SEATS, HOUSE_TO_CONTROL, SENATE_INDEPENDENTS_NOTE, SENATE_NOT_UP, SENATE_SEATS, SENATE_TO_CONTROL, VICE_PRESIDENT } from "@/features/simulator/midterms/races2026";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { NotConnectedPanel } from "../panels/NotConnectedPanel";
import { partyColor, partyLetter } from "../party";
import { raceLabel } from "../raceCodes";
import { etHourMinute } from "../countdown";
import { callFeed, chamberCount, HOUSE_CODES, leaderOf, progressLabel, SENATE_CODES, type ChamberCount, type LiveBoard, type LiveRace } from "./liveResults";
import { useOfficialLinks } from "./officialLinks";
import type { LiveResultsState } from "./useLiveResults";
import { useWarRoomFlags } from "../flags";
import { useCallTracker } from "./callTracker";
import { controlDecided, INDEPENDENT_CAUCUS, majorityStatus } from "./nightExtras";


const pctFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Links to each state's election office: the fallback whenever our source is delayed or off. */
export function OfficialLinks({ states, title = "Official results · state election offices" }: { states?: string[]; title?: string }) {
  const links = useOfficialLinks();
  const list = links.data ? Object.entries(links.data.states).filter(([state]) => !states || states.includes(state)) : [];
  return (
    <details className="wr-official">
      <summary>{title}{states ? ` · ${states.length} ${states.length === 1 ? "state" : "states"}` : ""}</summary>
      {links.isError ? <StatusLine tone="warn">Official links unavailable</StatusLine> : (
        <ul>
          {list.map(([state, link]) => (
            <li key={state}><a href={link.url} target="_blank" rel="noreferrer"><strong>{state}</strong> {link.office}</a></li>
          ))}
        </ul>
      )}
      {links.data && !links.data.checkedAt && <p className="wr-official-note">Links go to each state's election office, where official results are posted.</p>}
    </details>
  );
}

/** What the results feed is doing right now, in words, with the official fallback whenever it is not current. */
export function ResultsStatus({ state }: { state: LiveResultsState }) {
  if (state.kind === "off") return null;
  if (state.kind === "loading") return <StatusLine>Loading results…</StatusLine>;
  if (state.kind === "not-connected") {
    return (
      <NotConnectedPanel title="Results · not connected" source="civicAPI through the results API"
        description="The API is not serving results yet. Vote counts and race calls appear here once civicAPI is switched on for election night. Until then, use each state's official results.">
        <OfficialLinks />
      </NotConnectedPanel>
    );
  }
  if (state.kind === "switched-off" || state.kind === "unavailable") {
    return (
      <Panel title={state.kind === "switched-off" ? "Results · switched off" : "Results · temporarily unavailable"} meta={<Badge tone="accent">Use official results</Badge>} className="wr-results-alert">
        <p className="wr-off-copy">{state.kind === "switched-off"
          ? "The results source has been switched off, so no vote counts are shown. Official results are posted by each state's election office."
          : "The results API did not answer. It is retried every 30 seconds. Official results are posted by each state's election office."}</p>
        <OfficialLinks />
      </Panel>
    );
  }
  const { board, delayed } = state;
  const health = board.source.health;
  const late = delayed || board.freshness === "STALE" || health === "STALE" || health === "UNAVAILABLE";
  return (
    <>
      {board.isTestData && (
        <div className="wr-results-test" role="alert">
          <strong>Test data</strong> {board.source.name} is serving rehearsal numbers. They are not election results and no race has been decided.
        </div>
      )}
      {health === "NOT_CONFIGURED" && board.races.size === 0 && (
        <StatusLine>{board.source.message ?? `${board.source.name} has no live numbers yet.`}</StatusLine>
      )}
      {late && (
        <div className="wr-results-late" role="status">
          <span>Results last updated {formatEtTime(board.source.lastSuccessfulAt ?? board.updatedAt)} ET. The results source is delayed{health === "UNAVAILABLE" ? " and not answering" : ""}; the numbers below may be behind.</span>
          <OfficialLinks />
        </div>
      )}
      {health === "DEGRADED" && !late && <StatusLine tone="warn">Some races failed validation at {board.source.name} and keep their last good numbers.</StatusLine>}
    </>
  );
}

function SeatBar({ count, seats, toControl }: { count: ChamberCount; seats: number; toControl: number }) {
  const parts = [
    { key: "dc", value: count.called.D, color: "var(--wr-dem)", label: "D called" },
    { key: "dl", value: count.leading.D, color: "var(--wr-dem-deep)", label: "D leading" },
    { key: "oc", value: count.called.other + count.leading.other, color: "var(--wr-ind)", label: "Other" },
    { key: "nv", value: count.noVotes, color: "var(--wr-line-strong)", label: "No votes yet" },
    { key: "rl", value: count.leading.R, color: "var(--wr-rep-deep)", label: "R leading" },
    { key: "rc", value: count.called.R, color: "var(--wr-rep)", label: "R called" },
  ];
  return (
    <div className="wr-seatbar" role="img" aria-label={parts.map((part) => `${part.label} ${part.value}`).join(", ")}>
      {parts.map((part) => part.value > 0 && <span key={part.key} style={{ flexGrow: part.value, background: part.color }} title={`${part.label}: ${part.value}`} />)}
      <i style={{ left: `${(toControl / seats) * 100}%` }} aria-hidden="true" />
    </div>
  );
}

/** Seats called by the source's decision desk, and who leads the uncalled count, for each chamber. */
export function SeatCount({ board, attribution }: { board: LiveBoard | null; attribution: string | null }) {
  const flags = useWarRoomFlags();
  const senate = chamberCount(board, SENATE_CODES, SENATE_NOT_UP);
  const house = chamberCount(board, HOUSE_CODES);
  const desk = board ? `${board.source.name} decision desk` : "the decision desk";
  return (
    <Panel title="Seats · called and leading" meta={board ? <Badge tone={board.isTestData ? "mock" : "live"}>{board.isTestData ? "Test data" : "Live count"}</Badge> : undefined}
      footnote={`Calls are ${desk} projections, not certified results · Leading means ahead in the count so far · ${attribution ?? ""}`}>
      <div className="wr-seats">
        {([["U.S. Senate", senate, SENATE_SEATS, SENATE_TO_CONTROL], ["U.S. House", house, HOUSE_SEATS, HOUSE_TO_CONTROL]] as const).map(([label, count, seats, toControl]) => (
          <div key={label} className="wr-seats-chamber">
            <div className="wr-seats-head">
              <h3>{label}</h3>
              <span>{toControl} for control{label === "U.S. Senate" ? ` · 50 with ${VICE_PRESIDENT.name}'s tiebreak (${VICE_PRESIDENT.party})` : ""}</span>
            </div>
            <SeatBar count={count} seats={seats} toControl={toControl} />
            <dl className="wr-seats-figures">
              <div><dt>D called</dt><dd style={{ color: "var(--wr-dem)" }}>{count.called.D}</dd></div>
              <div><dt>R called</dt><dd style={{ color: "var(--wr-rep)" }}>{count.called.R}</dd></div>
              {count.called.other > 0 && <div><dt>Other called</dt><dd style={{ color: "var(--wr-ind)" }}>{count.called.other}</dd></div>}
              <div><dt>Uncalled</dt><dd>{count.uncalled}<span> · D lead {count.leading.D} · R lead {count.leading.R}{count.leading.other ? ` · other ${count.leading.other}` : ""}</span></dd></div>
            </dl>
            {label === "U.S. Senate" && <p className="wr-seats-note">Called includes the {SENATE_NOT_UP.D + SENATE_NOT_UP.R} seats not up this year (D {SENATE_NOT_UP.D} · R {SENATE_NOT_UP.R}). {SENATE_INDEPENDENTS_NOTE}{flags.caucus_note ? ` ${INDEPENDENT_CAUCUS["NE-SEN"].note}` : ""}</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const PARTY_NAME = { D: "Democrats", R: "Republicans" } as const;

/** A banner once called seats alone settle a chamber. Projections from the decision desk, never leads. */
export function ControlBanner({ board }: { board: LiveBoard }) {
  const flags = useWarRoomFlags();
  if (!flags.control_banner) return null;
  const decided = controlDecided(chamberCount(board, SENATE_CODES, SENATE_NOT_UP), chamberCount(board, HOUSE_CODES));
  if (decided.length === 0) return null;
  return (
    <div className="wr-control-banner" role="status" data-test={board.isTestData || undefined}>
      {decided.map((call) => (
        <p key={call.chamber}>
          {board.isTestData && <Badge tone="mock">Test data · not a result</Badge>}{" "}
          <strong>{call.chamber} control decided:</strong>{" "}
          <span style={{ color: partyColor(call.party) }}>{PARTY_NAME[call.party]}</span> have {call.seats} called seats
          {call.tiebreak ? `, a majority with ${VICE_PRESIDENT.name}'s tiebreak` : ` of ${call.chamber === "Senate" ? SENATE_SEATS : HOUSE_SEATS}`}.
        </p>
      ))}
      <p className="wr-dim">Based on {board.source.name} decision desk calls, which are projections, not certified results.</p>
    </div>
  );
}

/** The leader (or winner) of a race, compactly: "D Ossoff 52.2%". */
export function LeaderCell({ race }: { race: LiveRace | undefined }) {
  const flags = useWarRoomFlags();
  const leader = leaderOf(race);
  const majority = flags.runoff_labels ? majorityStatus(race) : null;
  if (!race) return <span className="wr-dim">No result yet</span>;
  if (!leader) return <span className="wr-dim">No votes counted</span>;
  const surname = leader.name.trim().split(/\s+/).pop();
  return (
    <span className="wr-leader" style={{ color: partyColor(leader.party) }}>
      {race.winner ? <Badge tone="live">Called</Badge> : null} {partyLetter(leader.party)} {surname} {pctFormat.format(leader.pct)}%
      {majority && (
        <span className="wr-majority" title={majority.kind === "runoff-called" ? "The source has called a runoff" : majority.rule.text}>
          {" "}<Badge tone="accent">{majority.kind === "runoff-called" ? "Runoff" : majority.rule.short}</Badge>
        </span>
      )}
    </span>
  );
}

type Chamber = "senate" | "house";
type Sort = "closest" | "counted" | "called";
const ROWS = 40;

/** Every race with a result, by chamber, sortable. Uncalled races say "leading", never "won". */
export function RaceBoard({ board }: { board: LiveBoard | null }) {
  const { search } = useLocation();
  const [chamber, setChamber] = useState<Chamber>("senate");
  const [sort, setSort] = useState<Sort>("closest");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const codes = chamber === "senate" ? SENATE_CODES : HOUSE_CODES;
    const races = codes.map((code) => ({ code, race: board?.races.get(code) }));
    const margin = (race?: LiveRace) => (race?.marginPts ?? Infinity);
    const calledAt = (race?: LiveRace) => race?.calls.find((call) => call.kind === "WINNER")?.calledAt ?? "";
    return races.sort((a, b) =>
      sort === "closest" ? (Number(Boolean(a.race?.winner)) - Number(Boolean(b.race?.winner))) || margin(a.race) - margin(b.race) || a.code.localeCompare(b.code)
        : sort === "counted" ? (b.race?.pctCounted ?? -1) - (a.race?.pctCounted ?? -1) || a.code.localeCompare(b.code)
          : calledAt(b.race).localeCompare(calledAt(a.race)) || a.code.localeCompare(b.code));
  }, [board, chamber, sort]);
  const shown = all ? rows : rows.slice(0, ROWS);
  return (
    <Panel flush title="Results board" meta={
      <div className="wr-board-controls">
        <div className="wr-seg" role="group" aria-label="Chamber">
          <button type="button" aria-pressed={chamber === "senate"} onClick={() => setChamber("senate")}>Senate</button>
          <button type="button" aria-pressed={chamber === "house"} onClick={() => setChamber("house")}>House</button>
        </div>
        <label className="wr-select">
          <span className="wr-sr-only">Sort races</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="closest">Closest uncalled first</option>
            <option value="counted">Most counted first</option>
            <option value="called">Latest calls first</option>
          </select>
        </label>
      </div>
    } footnote={board ? `${board.attribution} · Counted share is ${board.source.name}'s estimate of the expected vote` : undefined}>
      {!board ? <StatusLine>No results yet</StatusLine> : (
        <div className="wr-table-wrap">
          <table className="wr-table">
            <thead><tr><th scope="col">Race</th><th scope="col">Leading</th><th scope="col" className="wr-num">Margin</th><th scope="col" className="wr-num">Counted</th><th scope="col" className="wr-num">Votes</th><th scope="col">As of ET</th></tr></thead>
            <tbody>
              {shown.map(({ code, race }) => (
                <tr key={code} data-called={race?.winner ? "" : undefined}>
                  <td><Link className="wr-cell-btn" to={{ pathname: `/war-room/race/${code}`, search, hash: "results" }}>{raceLabel(code)}</Link></td>
                  <td><LeaderCell race={race} /></td>
                  <td className="wr-num">{race?.marginPts == null ? "—" : `${pctFormat.format(race.marginPts)} pts`}</td>
                  <td className="wr-num" title={race ? progressLabel(race) : undefined}>{race ? progressLabel(race, true) : "—"}</td>
                  <td className="wr-num">{race ? numberFormat.format(race.totalVotes) : "—"}</td>
                  <td className="wr-dim">{race ? formatEtTime(race.updatedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > ROWS && <button type="button" className="wr-btn wr-board-more" onClick={() => setAll(!all)}>{all ? `Show the first ${ROWS}` : `Show all ${rows.length}`}</button>}
        </div>
      )}
    </Panel>
  );
}

interface LogItem { at: number; key: string; node: JSX.Element }

/** Race calls from the decision desk and poll closings, newest first. */
export function CallLog({ board, closings, now }: { board: LiveBoard | null; closings: Array<{ close: number; states: Array<{ state: string }> }>; now: number }) {
  const { search } = useLocation();
  const flags = useWarRoomFlags();
  const tracker = useCallTracker().tracker;
  const calls = callFeed(board);
  const retractions = flags.retracted_calls && board && tracker ? tracker.retractions : [];
  const items: LogItem[] = [
    ...retractions.map((call) => ({
      at: call.noticedAt,
      key: `retracted-${call.key}-${call.noticedAt}`,
      node: (
        <>
          <time dateTime={new Date(call.noticedAt).toISOString()} title="When this browser saw the call disappear from the source">{formatEtTime(new Date(call.noticedAt).toISOString())}*</time>
          <span className="wr-log-dot" data-tone="accent" aria-hidden="true" />
          <span>
            <strong><Link className="wr-cell-btn" to={{ pathname: `/war-room/race/${call.code}`, search }}>{raceLabel(call.code)}</Link></strong>{" "}
            <Badge tone="accent">Call retracted</Badge> {call.calledBy} no longer calls this race for <strong style={{ color: partyColor(call.party) }}>{call.name}</strong> ({call.partyName ?? "no party"})
            <span className="wr-dim"> · was called {formatEtTime(call.calledAt)} ET{call.isTestData ? " · TEST DATA" : ""}</span>
          </span>
        </>
      ),
    })),
    ...calls.map((call) => ({
      at: Date.parse(call.at),
      key: `${call.code}-${call.candidate.id}-${call.kind}`,
      node: (
        <>
          <time dateTime={call.at} title={call.sourceTime ? "Time of the call" : "No call time from the source; when it was first seen"}>{formatEtTime(call.at)}{call.sourceTime ? "" : "*"}</time>
          <span className="wr-log-dot" data-tone="live" aria-hidden="true" style={{ background: partyColor(call.candidate.party) }} />
          <span>
            <strong><Link className="wr-cell-btn" to={{ pathname: `/war-room/race/${call.code}`, search }}>{raceLabel(call.code)}</Link></strong>{" "}
            {call.kind === "WINNER" ? "called for" : "runoff:"} <strong style={{ color: partyColor(call.candidate.party) }}>{call.candidate.name}</strong> ({call.candidate.partyName ?? "no party"})
            <span className="wr-dim"> · {call.calledBy}{call.isTestData ? " · TEST DATA" : ""}</span>
          </span>
        </>
      ),
    })),
    ...closings.filter((slot) => slot.close <= now).map((slot) => ({
      at: slot.close,
      key: `close-${slot.close}`,
      node: (
        <>
          <time dateTime={new Date(slot.close).toISOString()}>{etHourMinute(slot.close)}</time>
          <span className="wr-log-dot" aria-hidden="true" />
          <span><strong>Polls closed</strong> in most of {slot.states.map((item) => item.state).join(", ")}.</span>
        </>
      ),
    })),
  ].sort((a, b) => b.at - a.at);
  return (
    <Panel flush title="Call log" meta={<Badge tone={calls.length ? "live" : "off"}>{calls.length ? `${calls.length} calls` : "No calls yet"}</Badge>}
      footnote={`Calls are the source's decision desk projections, not certified results · * time first seen; the source gave none${retractions.length ? " · retractions are what this browser has seen since it opened" : ""} · never copied from broadcasts`}>
      {items.length === 0 ? <StatusLine>No calls or poll closings yet · first close Nov 3, 18:00 ET</StatusLine> : (
        <ol className="wr-log" data-scroll tabIndex={0} aria-label="Calls and poll closings, newest first">{items.slice(0, 200).map((item) => <li key={item.key}>{item.node}</li>)}</ol>
      )}
    </Panel>
  );
}
