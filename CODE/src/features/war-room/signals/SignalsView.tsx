import { lazy, Suspense, useCallback, useState } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { getRaceOutsideSpending, type RaceOutsideSpending } from "@/lib/api";
import { economyEnabled, mockResultsProviderEnabled, moversEnabled, newsEnabled, pollsEnabled } from "@/lib/featureFlags";
import { stateMapItems } from "@/features/election-dashboard/map";
import { buildTiles, useEconIndicators, type EconTile } from "@/features/election-monitor/economy";
import { GAP_MS as INDICATOR_GAP_MS } from "@/features/election-monitor/indicatorGaps";
import { formatEtTime, formatShortDate } from "@/features/election-monitor/constants";
import { historyByTicker, historyStart, useMarketHistory, type Mover } from "@/features/election-monitor/marketHistory";
import { MONITOR_CYCLE, useStateContests, useStateCounts } from "@/features/election-monitor/realData";
import { useControlOdds, useKalshiMarkets, type KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { PriceTrace } from "../charts";
import { etDate } from "../countdown";
import { money } from "../dossier/dossier";
import { MoversPanel } from "../MoversPanel";
import { ComingSoonPanel } from "../panels/ComingSoonPanel";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor } from "../party";
import { CONTROL_DAYS, CONTROL_RACES } from "../queries";
import { raceDistrict, raceLabel, raceState } from "../raceCodes";
import { cents } from "../seatTally";
import { HOUR_MS, priceRange, signedPoints, tracePolylines } from "../trace";
import { useBoard } from "../useBoard";
import { useWatchlist } from "../watchlist";
import { spendingSides } from "./spending";

// Recharts loads with the first dialog opened, not with the War Room.
const IndicatorHistoryDialog = lazy(() => import("@/features/election-monitor/IndicatorHistoryDialog"));
/** The per-race route is called once per watchlist race, so the panel takes the first eight. */
const SPEND_RACES = 8;

function ControlChart({ chamber, markets, history }: { chamber: string; markets: KalshiMarket[]; history: ReturnType<typeof useMarketHistory> }) {
  const byTicker = historyByTicker(history.data);
  const series = markets.filter((market) => market.party === "D" || market.party === "R")
    .map((market) => ({ key: market.ticker, label: market.party!, color: partyColor(market.party), points: byTicker.get(market.ticker)?.points ?? [] }));
  const end = Date.now();
  const first = historyStart(history.data, series.map((item) => item.key));
  // History starts Oct 14, so the chart begins there rather than with 30 empty days.
  const start = Math.max(end - CONTROL_DAYS * 24 * HOUR_MS, first ?? end - CONTROL_DAYS * 24 * HOUR_MS);
  const range = priceRange([...series.map((item) => item.points), [[0, 50]]]);
  const live = markets.filter((market) => market.pricePercent !== null).sort((a, b) => b.pricePercent! - a.pricePercent!)[0];
  const leaderPoints = live ? byTicker.get(live.ticker)?.points ?? [] : [];
  const change = live && leaderPoints.length ? live.pricePercent! - leaderPoints[0][1] : null;
  return (
    <div className="wr-chamber-chart">
      <div className="wr-chamber-head">
        <span>{chamber}</span>
        {live && <span><strong style={{ color: partyColor(live.party) }}>{live.party} {cents(live.pricePercent!)}</strong>{change !== null && first ? ` ${signedPoints(change)} since ${etDate(first)}` : ""}</span>}
      </div>
      {series.every((item) => item.points.length === 0)
        ? <StatusLine>{history.isLoading ? "Loading…" : history.isError ? "Market history unavailable" : "No stored prices yet"}</StatusLine>
        : <PriceTrace series={series} domain={[start, end]} range={range} guides={[50]} height={160}
          label={`${chamber} control on Kalshi since ${etDate(start)}: ${series.map((item) => `${item.label} ${item.points[0]?.[1] ?? "?"} to ${item.points[item.points.length - 1]?.[1] ?? "?"} cents`).join(", ")}`} />}
    </div>
  );
}

function ChamberHistory() {
  const odds = useControlOdds();
  const history = useMarketHistory(CONTROL_RACES, CONTROL_DAYS);
  const first = historyStart(history.data);
  return (
    <Panel brackets="top" title={`Chamber control · ${CONTROL_DAYS} days`} className="wr-chambers"
      meta={<><span className="wr-key"><span style={{ background: "var(--wr-dem)" }} aria-hidden="true" />D</span><span className="wr-key"><span style={{ background: "var(--wr-rep)" }} aria-hidden="true" />R</span></>}
      footnote={`Kalshi · hourly snapshots · midpoint${first ? ` · history starts ${etDate(first)}` : ""} · gaps kept · not a forecast`}>
      <div className="wr-chamber-charts">
        <ControlChart chamber="House" markets={odds.house} history={history} />
        <ControlChart chamber="Senate" markets={odds.senate} history={history} />
      </div>
    </Panel>
  );
}

function Coverage() {
  const counts = useStateCounts();
  const board = useBoard();
  const { markets } = useKalshiMarkets();
  const ready = board.marketCount !== null && board.senate && board.house;
  const statesWithRaces = counts.data ? stateMapItems.filter((item) => (counts.data[item.code] ?? 0) > 0).length : null;
  const priced = [...markets.values()].filter((market) => market.pricePercent !== null);
  const rows: Array<{ label: string; ratio: number | null; note?: string }> = [
    { label: "States with races", ratio: statesWithRaces === null ? null : statesWithRaces / stateMapItems.length, note: counts.isError ? "API down" : "Loading" },
    { label: "Races with a market", ratio: ready ? (board.senate!.withMarket + board.house!.withMarket) / (board.senate!.total + board.house!.total) : null, note: "Waiting for Kalshi" },
    { label: "Races priced", ratio: ready ? (board.senate!.priced + board.house!.priced) / (board.senate!.total + board.house!.total) : null, note: "Waiting for Kalshi" },
    { label: "Midpoint quotes", ratio: priced.length ? priced.filter((market) => market.priceType === "MIDPOINT").length / priced.length : null, note: "Waiting for Kalshi" },
    { label: "House seat holders", ratio: null, note: board.holdersAsOf ? `File of ${formatShortDate(board.holdersAsOf)}` : "Not loaded" },
    { label: "Polls", ratio: null, note: pollsEnabled ? "VoteHub, per race" : "Off" },
    { label: "Live results", ratio: null, note: mockResultsProviderEnabled ? "Mock fixtures only" : "Not connected" },
    { label: "Per-race news", ratio: null, note: newsEnabled ? "Not connected · national top stories only" : "Not connected" },
  ];
  return (
    <Panel title="Data coverage" meta="National">
      <div className="wr-coverage">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            {row.ratio === null
              ? <em data-off={/^Not connected|^Off|^Not loaded|API down/.test(row.note ?? "") || undefined}>{row.note}</em>
              : <span className="wr-meter" role="meter" aria-label={row.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.ratio * 100)}><span style={{ width: `${row.ratio * 100}%` }} /></span>}
            <strong>{row.ratio === null ? "" : `${Math.round(row.ratio * 100)}%`}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** One watchlist race's outside money by the side it helps, with each part drawn so nothing is netted. */
function SpendRow({ code, query, scale }: { code: string; query: UseQueryResult<RaceOutsideSpending>; scale: number }) {
  const contests = useStateContests(raceState(code));
  const district = raceDistrict(code);
  const contest = contests.data?.find((item) => (district ? item.office === "US_HOUSE" && item.district === district : item.office === "US_SENATE"));
  const data = query.data;
  const pct = (value: number) => `${(value / scale) * 100}%`;
  if (!data || data.coverage.status === "not_synced") {
    return (
      <div className="wr-spend-row">
        <span />
        <span className="wr-spend-race">{raceLabel(code)}</span>
        <span className="wr-dim">{query.isLoading ? "…" : query.isError ? "Unavailable" : "Not synced"}</span>
      </div>
    );
  }
  const sides = spendingSides(data, contest);
  if (sides.forD + sides.againstR + sides.forR + sides.againstD + sides.other === 0) {
    return (
      <div className="wr-spend-row">
        <span />
        <span className="wr-spend-race">{raceLabel(code)}</span>
        <span className="wr-dim">None reported</span>
      </div>
    );
  }
  const label = `${raceLabel(code)}: helps D ${money(sides.forD + sides.againstR)} (for D ${money(sides.forD)}, against R ${money(sides.againstR)}); helps R ${money(sides.forR + sides.againstD)} (for R ${money(sides.forR)}, against D ${money(sides.againstD)})`;
  return (
    <div className="wr-spend-row" role="group" aria-label={label}>
      <div className="wr-spend-side" data-side="d" aria-hidden="true">
        <span>{money(sides.forD + sides.againstR)}</span>
        <i data-style="hatch" style={{ width: pct(sides.againstR) }} />
        <i data-style="solid" style={{ width: pct(sides.forD) }} />
      </div>
      <span className="wr-spend-race" aria-hidden="true">{raceLabel(code)}</span>
      <div className="wr-spend-side" data-side="r" aria-hidden="true">
        <i data-style="solid" style={{ width: pct(sides.forR) }} />
        <i data-style="hatch" style={{ width: pct(sides.againstD) }} />
        <span>{money(sides.forR + sides.againstD)}</span>
      </div>
    </div>
  );
}

function WatchSpending({ codes }: { codes: string[] }) {
  const races = codes.slice(0, SPEND_RACES);
  // The same query as the monitor's and the dossier's outside-spending cards.
  const queries = useQueries({
    queries: races.map((code) => {
      const state = raceState(code);
      const district = raceDistrict(code);
      const office = district ? "H" as const : "S" as const;
      return {
        queryKey: ["election-monitor", "outside-spending", state, office, district, MONITOR_CYCLE],
        staleTime: 10 * 60_000,
        retry: 1,
        queryFn: () => getRaceOutsideSpending({ state, office, district, cycle: MONITOR_CYCLE }),
      };
    }),
  });
  // One scale for every row: the largest race total, so a race where all of it helps one side fills that side.
  const scale = Math.max(1, ...queries.map((query) => query.data?.candidates.reduce((sum, item) => sum + item.support + item.oppose, 0) ?? 0));
  return (
    <Panel id="money" title="Outside spending · watchlist" meta={`${races.length} races · ${MONITOR_CYCLE} cycle`}
      footnote="FEC Schedule E per race · helps D = for D + against R, each part drawn, never netted · a national leaderboard needs an aggregate endpoint">
      {races.length === 0 ? <StatusLine>Your watchlist is empty</StatusLine> : (
        <>
          <div className="wr-spend-axis" aria-hidden="true"><span className="wr-dem">◀ Helps D</span><span>Solid: for · hatched: against the other side</span><span className="wr-rep">Helps R ▶</span></div>
          <div className="wr-spend">{races.map((code, i) => <SpendRow key={code} code={code} query={queries[i]} scale={scale} />)}</div>
        </>
      )}
    </Panel>
  );
}

function FredTile({ tile, onOpen }: { tile: EconTile; onOpen: (opener: HTMLElement) => void }) {
  const points = tile.spark?.points ?? [];
  const values = points.map(([, value]) => value);
  // Economic series are days to quarters apart; they break only at a missing period, as on the monitor.
  const lines = points.length > 1 && tile.spark
    ? tracePolylines(points, [points[0][0], points[points.length - 1][0]], [Math.min(...values), Math.max(...values)], 160, 26, INDICATOR_GAP_MS[tile.spark.frequency])
    : [];
  return (
    <button type="button" className="wr-fred" data-missing={tile.missing || undefined} aria-haspopup="dialog" onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`${tile.label}: ${tile.value}${tile.change ? `, ${tile.change.text} ${tile.change.basis}` : ""}${tile.period ? `, ${tile.period}` : ""}${tile.stale ? ", stale" : ""}. Open history chart`}>
      <span className="wr-fred-head"><span>{tile.label}</span>{tile.stale && <span className="wr-badge" data-tone="off">Stale</span>}</span>
      <span className="wr-fred-figures"><strong>{tile.value}</strong>{tile.change && <span>{tile.change.text}</span>}</span>
      <svg viewBox="0 0 160 28" preserveAspectRatio="none" width="100%" height="28" aria-hidden="true" focusable="false">
        {lines.map((line, index) => <polyline key={index} points={line} fill="none" stroke="var(--wr-fred-trace)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <span className="wr-fred-basis">{[tile.period, tile.change?.basis].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

function FredTiles() {
  const indicators = useEconIndicators(730, null);
  const [history, setHistory] = useState<{ tile: EconTile; opener: HTMLElement; open: boolean } | null>(null);
  const tiles = indicators.data ? buildTiles(indicators.data) : [];
  const fetched = indicators.data?.series.map((series) => series.fetchedAt).filter((at): at is string => Boolean(at)).sort().pop();
  return (
    <Panel id="econ" title="Macro · FRED" meta={fetched ? `Fetched ${formatEtTime(fetched)} ET` : undefined}
      footnote="Federal Reserve Bank of St. Louis · context only, not a forecast or an explanation of the odds">
      {!economyEnabled ? <StatusLine>Economic indicators are switched off</StatusLine>
        : indicators.isLoading ? <StatusLine>Loading FRED indicators…</StatusLine>
          : tiles.length === 0 || tiles.every((tile) => tile.missing) ? <StatusLine>FRED indicators not loaded yet</StatusLine>
            : <div className="wr-fred-grid">{tiles.map((tile) => <FredTile key={tile.id} tile={tile} onOpen={(opener) => setHistory({ tile, opener, open: true })} />)}</div>}
      {history && (
        <Suspense fallback={null}>
          <IndicatorHistoryDialog tile={history.tile} stateCode={null} stateName={null} open={history.open} returnFocusTo={history.opener}
            onOpenChange={(open) => setHistory({ ...history, open })} />
        </Suspense>
      )}
    </Panel>
  );
}

/** Markets, money and macro over time. */
export function SignalsView() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const board = useBoard();
  const ready = board.marketCount !== null;
  const watch = useWatchlist(ready ? board.senate : null, ready ? board.house : null);
  const openRace = useCallback((mover: Mover) => {
    if (!mover.stateCode) return;
    navigate({ pathname: `/war-room/race/${mover.scope === "HOUSE_DISTRICT" ? mover.race : `${mover.stateCode}-SEN`}`, search });
  }, [navigate, search]);
  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Signals // Markets · money · macro</div>
          <h1 className="wr-page-title">Signals</h1>
        </div>
      </div>
      <div className="wr-signals-top">
        <ChamberHistory />
        <Coverage />
      </div>
      <div className="wr-signals-mid">
        {moversEnabled && <MoversPanel initial="7d" detailed onSelect={openRace} />}
        <ComingSoonPanel title="Tipping point · House" description="The House districts most likely to decide control, from 10,000 simulated elections." />
      </div>
      <div className="wr-signals-low">
        <WatchSpending codes={watch.list} />
        <FredTiles />
      </div>
      <footer className="wr-footer">
        <span>Src: Kalshi live · hourly market snapshots · FEC Schedule E · FRED</span>
        <span>Market prices are not forecasts or results</span>
      </footer>
    </>
  );
}

