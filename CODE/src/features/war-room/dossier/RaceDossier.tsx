import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { getRaceOutsideSpending } from "@/lib/api";
import { pollsEnabled } from "@/lib/featureFlags";
import { historyByTicker, historyStart, useMarketHistory } from "@/features/election-monitor/marketHistory";
import { isRedistricted } from "@/features/election-monitor/map/redistricting";
import type { SeatHolder } from "@/features/election-monitor/oddsMap";
import { MONITOR_CYCLE, useStateContests } from "@/features/election-monitor/realData";
import { RacePolls } from "@/features/polls/RacePolls";
import { useRacePolls } from "@/features/polls/polls";
import { candidateNamesOf } from "@/features/election-monitor/constants";
import { SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import { targetSearch } from "../links";
import { Brackets, Panel, StatusLine } from "../panels/Panel";
import { ComingSoonPanel } from "../panels/ComingSoonPanel";
import { heldBy, partyColor, partyLetter } from "../party";
import { TARGET_DAYS } from "../queries";
import { STATE_NAMES, normaliseRaceCode, raceDistrict, raceLabel, raceState, raceTitle } from "../raceCodes";
import { changeOver } from "../trace";
import { useBoard } from "../useBoard";
import { useWatchlist } from "../watchlist";
import { buildRaceLog, pickCandidates } from "./dossier";
import { Candidates } from "./Candidates";
import { MarketPanel } from "./MarketPanel";
import { MoneyPanel } from "./MoneyPanel";
import { ProfilePanel } from "./ProfilePanel";
import { MAP_SCREEN } from "../screens";
import { RaceLogPanel } from "./RaceLogPanel";
import { TerrainPanel } from "./TerrainPanel";

const SECTIONS = [["candidates", "Candidates"], ["market", "Market"], ["money", "Money"], ...(pollsEnabled ? [["polls", "Polls"]] : []), ["terrain", "Terrain"], ["profile", "Profile"], ["log", "Log"]];

function UnknownRace({ segment }: { segment: string }) {
  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">Dossier // not found</div>
          <h1 className="wr-page-title">No 2026 race “{segment}”</h1>
        </div>
      </div>
      <Panel title="Try a race code">
        <p className="wr-off-copy">Dossiers use race codes like NC-SEN for a Senate race, PA-07 for a House seat, or DE-AL for an at-large seat. Use the search above, or <Link to="/war-room">go back to Command</Link>.</p>
      </Panel>
    </>
  );
}

/** One race in depth: candidates, market history, money, polls, past margins, the ACS profile, and a race log. */
export function RaceDossier() {
  const { code: segment = "" } = useParams();
  const location = useLocation();
  const code = normaliseRaceCode(segment);
  if (!code) return <UnknownRace segment={segment} />;
  // "pa-7" and "AK-AL" work as links; the address settles on the canonical code.
  if (code !== segment) return <Navigate to={{ pathname: `/war-room/race/${code}`, search: location.search }} replace />;
  return <Dossier key={code} code={code} />;
}

function Dossier({ code }: { code: string }) {
  const { search } = useLocation();
  const state = raceState(code);
  const district = raceDistrict(code);
  const house = district !== null;
  const live = useBoard();
  const board = useMemo(() => (live.marketCount === null ? { ...live, senate: null, house: null } : live), [live]);
  const watch = useWatchlist(board.senate, board.house);
  const race = (house ? board.house : board.senate)?.races.get(house ? code : state);
  const contests = useStateContests(state);
  const contest = contests.data?.find((item) => (house ? item.office === "US_HOUSE" && item.district === district : item.office === "US_SENATE"));
  const picked = pickCandidates(contest);
  const office = house ? "H" : "S";
  // Same query as the monitor's outside-spending card, so the two share a cache entry.
  const spending = useQuery({
    queryKey: ["election-monitor", "outside-spending", state, office, house ? district : null, MONITOR_CYCLE],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: () => getRaceOutsideSpending({ state, office, district, cycle: MONITOR_CYCLE }),
  });
  const history = useMarketHistory([code], TARGET_DAYS);
  const byTicker = historyByTicker(history.data);
  const polls = useRacePolls(pollsEnabled ? code : null);
  const leader = race?.leader ?? null;
  const leaderPoints = leader ? byTicker.get(leader.market.ticker)?.points ?? [] : [];
  const senateRace = SENATE_RACES_2026[state];
  const holder: SeatHolder | null = race?.holder ?? (senateRace ? { party: senateRace.holder, name: senateRace.incumbent, retiring: senateRace.open } : null);
  const index = watch.list.indexOf(code);
  const surname = holder?.name.split(" ").pop();

  const log = buildRaceLog({
    historyStart: historyStart(history.data),
    leader: leader && leaderPoints.length ? { label: leader.market.outcome, price: leader.price, change: changeOver(leaderPoints, 24), at: leaderPoints[leaderPoints.length - 1][0] } : null,
    candidates: [picked.d, picked.r].flatMap((candidate) => (candidate ? [{ name: candidate.name, fundingThrough: candidate.fundingThrough ?? null }] : [])),
    spending: spending.data?.coverage ?? null,
    newestPoll: polls.data?.average?.newestEndDate ?? null,
  });

  return (
    <>
      <nav className="wr-crumbs" aria-label="Breadcrumb">
        <Link to={{ pathname: "/war-room", search }}>United States</Link><span aria-hidden="true">›</span>
        <Link to={{ pathname: "/war-room", search: targetSearch(search, state, null), hash: "#theater" }}>{STATE_NAMES[state]}</Link><span aria-hidden="true">›</span>
        <span aria-current="page">{house ? raceLabel(code) : "U.S. Senate"}</span>
      </nav>

      <section className="wr-panel wr-dossier-head" aria-labelledby="wr-dossier-title" data-strong>
        <Brackets />
        <div className="wr-dossier-id">
          <div>
            <div className="wr-eyebrow wr-accent">Dossier // {index >= 0 ? `Watchlist ${String(index + 1).padStart(2, "0")} of ${watch.list.length}` : "Not on your watchlist"}</div>
            <h1 id="wr-dossier-title" className="wr-dossier-code">{raceLabel(code)}</h1>
          </div>
          <div className="wr-dossier-sub">
            <span className="wr-dossier-title">{raceTitle(code)}{senateRace?.special ? " · Special election" : ""}</span>
            <div className="wr-chips-row">
              {!house && senateRace && <span className="wr-badge">{senateRace.open ? "Open seat" : "Incumbent running"}</span>}
              {holder && (
                <span className="wr-badge" style={{ borderColor: partyColor(holder.party), color: partyColor(holder.party) }}>
                  {partyLetter(holder.party)}-held · {holder.vacant ? "vacant" : `${surname}${holder.retiring ? " not running" : ""}`}
                </span>
              )}
              {race?.flip && leader && <span className="wr-badge" data-tone="accent">Flip watch · {partyLetter(leader.party)} leads {heldBy(holder?.party)} seat</span>}
              {house && isRedistricted(state) && <span className="wr-badge">Redrawn for 2026</span>}
            </div>
          </div>
        </div>
        <div className="wr-head-actions">
          <button type="button" className="wr-btn" aria-pressed={index >= 0} onClick={() => watch.toggle(code)}>{index >= 0 ? "★ Watching" : "☆ Watch"}</button>
          <Link className="wr-btn" to={{ pathname: "/war-room", search: targetSearch(search, state, code), hash: "#theater" }}>Show on map</Link>
          <Link className="wr-btn" to={{ pathname: MAP_SCREEN, search: targetSearch(search, state, code) }}>Area intel</Link>
        </div>
      </section>

      <nav className="wr-sections" aria-label="Dossier sections">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <div className="wr-dossier">
        <div className="wr-dossier-main">
          <Candidates id="candidates" picked={picked} markets={race?.markets ?? []} byTicker={byTicker} spending={spending} contestsLoading={contests.isLoading} contestsError={contests.isError} boardReady={board.marketCount !== null} />
          <MarketPanel id="market" code={code} markets={race?.markets ?? []} />
          <MoneyPanel id="money" picked={picked} spending={spending} />
          {pollsEnabled && (
            <Panel id="polls" title="Polls · VoteHub">
              <RacePolls race={code} candidateNames={candidateNamesOf(contest)} />
            </Panel>
          )}
        </div>
        <div className="wr-dossier-side">
          <TerrainPanel id="terrain" code={code} />
          <ProfilePanel id="profile" state={state} district={district} />
          <RaceLogPanel id="log" entries={log} loading={history.isLoading || spending.isLoading} />
          <ComingSoonPanel title="Why it moved · analyst agent" description="A plain-language explanation of this race's latest price move, citing news coverage, once news ingestion and the analyst agent are connected." />
        </div>
      </div>
      {contests.isError && <StatusLine tone="warn">Candidates unavailable: the elections API did not answer.</StatusLine>}

      <footer className="wr-footer">
        <span>Src: FEC · Schedule E · Kalshi live · MIT Election Lab · Census ACS 5-year{pollsEnabled ? " · VoteHub" : ""}</span>
        <span>Market prices are not forecasts or results</span>
      </footer>
    </>
  );
}
