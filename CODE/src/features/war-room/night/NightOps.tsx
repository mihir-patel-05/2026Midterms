import { Link, useLocation } from "react-router-dom";
import { mockResultsProviderEnabled } from "@/lib/featureFlags";
import { districtLabel, formatEtTime, numberFormat } from "@/features/election-monitor/constants";
import { useEconIndicators } from "@/features/election-monitor/economy";
import { useMarketMovers } from "@/features/election-monitor/marketHistory";
import { useMockResultsFeed, useResultsSourceStatus } from "@/features/election-monitor/mockResults";
import { useStateCounts } from "@/features/election-monitor/realData";
import { countdown, etHourMinute } from "../countdown";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { NotConnectedPanel } from "../panels/NotConnectedPanel";
import { partyColor, partyLetter } from "../party";
import { raceLabel, raceState } from "../raceCodes";
import { cents } from "../seatTally";
import { useBoard } from "../useBoard";
import { useNow } from "../useNow";
import { useWatchlist } from "../watchlist";
import { closedCount, closingFor, closingSlots, nextClose, POLL_CLOSINGS } from "./pollClosings";

const SLOTS = closingSlots();
const KEY_RACES = 10;

function Timeline({ now }: { now: number }) {
  const next = nextClose(now);
  return (
    <Panel title="Poll closing timeline · ET · Nov 3" meta="Most of each state · split states note their last close"
      footnote="Compiled from published schedules · confirm with each state's election office · individual polling places can differ">
      <ol className="wr-timeline">
        {SLOTS.map((slot) => {
          const closed = slot.close <= now;
          return (
            <li key={slot.close} data-closed={closed || undefined} data-next={slot.close === next || undefined}>
              <span className="wr-timeline-time">{etHourMinute(slot.close)}{closed ? " ✓" : ""}{slot.close === next ? " · next" : ""}</span>
              <span className="wr-timeline-states">
                {slot.states.map((item) => <abbr key={item.state} title={item.note ?? `Polls close at ${etHourMinute(item.close)} ET`}>{item.state}{item.last ? "*" : ""}</abbr>)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="wr-timeline-note">* Part of the state closes later: {POLL_CLOSINGS.filter((item) => item.note).map((item) => `${item.state}: ${item.note}`).join("; ")}.</p>
    </Panel>
  );
}

function NightFigures({ now, markets }: { now: number; markets: number | null }) {
  const next = nextClose(now);
  return (
    <dl className="wr-night-figures">
      <div><dt>Polls closed</dt><dd>{closedCount(now)}<span> / {POLL_CLOSINGS.length}</span></dd></div>
      <div><dt>Next close</dt><dd>{next ? etHourMinute(next) : "All closed"}</dd></div>
      <div><dt>First close in</dt><dd>{countdown(now)}</dd></div>
      <div><dt>Markets live</dt><dd>{markets === null ? "–" : numberFormat.format(markets)}</dd></div>
    </dl>
  );
}

/** Watchlist races with their poll close and market. No vote counts until a provider is licensed. */
function KeyRaces({ now, codes, board }: { now: number; codes: string[]; board: ReturnType<typeof useBoard> }) {
  return (
    <Panel flush title="Key races · watchlist" meta={<Badge tone="off">No results until a provider is licensed</Badge>}
      footnote="Market prices keep updating and are not results · never scraped or partial totals">
      {codes.length === 0 ? <StatusLine>Your watchlist is empty</StatusLine> : (
        <div className="wr-table-wrap">
          <table className="wr-table">
            <thead><tr><th scope="col">Race</th><th scope="col">Polls</th><th scope="col">Results</th><th scope="col" className="wr-num">Market</th></tr></thead>
            <tbody>
              {codes.slice(0, KEY_RACES).map((code) => {
                const closing = closingFor(raceState(code));
                const house = !code.endsWith("-SEN");
                const leader = (house ? board.house : board.senate)?.races.get(house ? code : raceState(code))?.leader;
                return (
                  <tr key={code}>
                    <td><Link className="wr-cell-btn" to={`/war-room/race/${code}`}>{raceLabel(code)}</Link></td>
                    <td className={closing && closing.close <= now ? "wr-accent" : undefined}>{closing ? `${closing.close <= now ? "Closed" : "Closes"} ${etHourMinute(closing.close)}${closing.last ? "*" : ""}` : "—"}</td>
                    <td className="wr-dim">Not connected</td>
                    <td className="wr-num" style={{ color: leader ? partyColor(leader.party) : undefined }}>{leader ? `${partyLetter(leader.party)} ${cents(leader.price)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Poll closings so far, newest first. Race calls join it with the results provider. */
function CallLog({ now }: { now: number }) {
  const closed = SLOTS.filter((slot) => slot.close <= now).reverse();
  return (
    <Panel flush title="Call log" meta={<Badge tone="off">Calls not connected</Badge>}>
      <p className="wr-log-intro">Race calls arrive with the results provider. Until then, this log shows poll closings only.</p>
      {closed.length === 0 ? <StatusLine>No polls have closed yet · first close Nov 3, 18:00 ET</StatusLine> : (
        <ol className="wr-log">
          {closed.map((slot) => (
            <li key={slot.close}>
              <time dateTime={new Date(slot.close).toISOString()}>{etHourMinute(slot.close)}</time>
              <span className="wr-log-dot" aria-hidden="true" />
              <span><strong>Polls closed</strong> in most of {slot.states.map((item) => item.state).join(", ")}.</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** The fictional fixtures from /api/v1, for staging only. Every row says MOCK. */
function MockBoard() {
  const feed = useMockResultsFeed();
  const contests = feed.data?.contests ?? [];
  return (
    <Panel flush title="Results board · mock fixtures" meta={<Badge tone="mock">Mock · fictional</Badge>}
      footnote="Fictional fixtures from the results read model; not real election information">
      {feed.isLoading ? <StatusLine>Loading mock results…</StatusLine> : feed.isError ? <StatusLine tone="warn">Mock results unavailable</StatusLine> : contests.length === 0 ? <StatusLine>No mock contests</StatusLine> : (
        <div className="wr-table-wrap">
          <table className="wr-table">
            <thead><tr><th scope="col">Contest</th><th scope="col" className="wr-num">Reporting</th><th scope="col">Leading</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {contests.map((contest) => {
                const result = feed.data!.resultsByContest[contest.id];
                const top = result ? [...result.candidates].sort((a, b) => b.votes - a.votes)[0] : undefined;
                const name = top ? contest.candidates.find((candidate) => candidate.id === top.candidateId)?.name : undefined;
                return (
                  <tr key={contest.id}>
                    <td><Badge tone="mock">Mock</Badge> {contest.title}{contest.district ? ` · ${districtLabel(contest.stateCode, contest.district)}` : ""}</td>
                    <td className="wr-num">{result?.reportingPercent == null ? "—" : `${result.reportingPercent.toFixed(0)}%`}</td>
                    <td>{name && top ? `${name} ${top.percentage.toFixed(1)}%` : "—"}</td>
                    <td>{result ? result.status.toLowerCase().replace("_", " ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Health({ board }: { board: ReturnType<typeof useBoard> }) {
  const counts = useStateCounts();
  const indicators = useEconIndicators(730, null);
  const sources = useResultsSourceStatus();
  const movers = useMarketMovers("24h", null);
  const fred = indicators.data?.series.map((series) => series.fetchedAt).filter((at): at is string => Boolean(at)).sort().pop();
  const rows: Array<[string, string, "good" | "warn" | undefined]> = [
    ["Kalshi stream", board.status === "live" ? `Live · ${numberFormat.format(board.marketCount ?? 0)} markets` : board.status, board.status === "live" ? "good" : "warn"],
    ["Hourly snapshots", movers.data?.asOf ? `Latest ${formatEtTime(movers.data.asOf)} ET` : movers.isError ? "Unavailable" : "…", movers.data?.asOf ? "good" : movers.isError ? "warn" : undefined],
    ["Elections API", counts.isError ? "Down" : counts.dataUpdatedAt ? `OK · ${formatEtTime(new Date(counts.dataUpdatedAt).toISOString())} ET` : "…", counts.isError ? "warn" : counts.dataUpdatedAt ? "good" : undefined],
    ["FRED", fred ? `Fetched ${formatEtTime(fred)} ET` : indicators.isError ? "Not loaded" : "…", fred ? "good" : indicators.isError ? "warn" : undefined],
    ["Results source", mockResultsProviderEnabled
      ? sources.data?.length ? sources.data.map((source) => `${source.isMock ? "Mock" : source.name} · ${source.health.toLowerCase().replace("_", " ")}`).join(", ") : sources.isError ? "Unavailable" : "…"
      : "No provider connected", "warn"],
  ];
  return (
    <Panel title="System health" meta="This browser's view">
      <dl className="wr-health">
        {rows.map(([label, value, tone]) => <div key={label}><dt>{label}</dt><dd data-tone={tone}>{value}</dd></div>)}
      </dl>
    </Panel>
  );
}

/** Election night: poll closings, key races and the call log. Vote counts and calls wait for a licensed provider. */
export function NightOps() {
  const { search } = useLocation();
  const now = useNow();
  const live = useBoard();
  const board = live.marketCount === null ? { ...live, senate: null, house: null } : live;
  const watch = useWatchlist(board.senate, board.house);
  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Election night // Nov 3</div>
          <h1 className="wr-page-title">Count desk</h1>
        </div>
        <div className="wr-head-actions">
          <div className="wr-seg" data-size="lg" role="group" aria-label="Phase">
            <Link to={{ pathname: "/war-room", search }}>Pre-election</Link>
            <Link to={{ pathname: "/war-room/night", search }} aria-current="page">Election night</Link>
          </div>
          <Badge tone={mockResultsProviderEnabled ? "mock" : "off"}>{mockResultsProviderEnabled ? "Staging · mock results" : "No results provider"}</Badge>
        </div>
      </div>

      <NotConnectedPanel title="Results · not connected" source="Licensed results provider"
        description="No results provider is licensed yet, so there are no called seats, vote counts or reporting figures here. Market prices keep updating, and they are not results.">
        <NightFigures now={now} markets={board.marketCount} />
      </NotConnectedPanel>

      <Timeline now={now} />

      <div className="wr-grid-panels">
        <KeyRaces now={now} codes={watch.list} board={board} />
        <CallLog now={now} />
      </div>

      {mockResultsProviderEnabled && <MockBoard />}

      <div className="wr-grid-panels">
        <NotConnectedPanel title="Live coverage" source="Network YouTube stream IDs"
          description="Election-night streams appear once each network's scheduled stream is looked up and loaded (Oct 31 to Nov 2, PLAN §4.7). Embeds will use youtube-nocookie.com." />
        <Health board={board} />
      </div>

      <footer className="wr-footer">
        <span>Src: poll closings from published state schedules · Kalshi live{mockResultsProviderEnabled ? " · mock results fixtures" : ""}</span>
        <span>Market prices are not forecasts or results</span>
      </footer>
    </>
  );
}
