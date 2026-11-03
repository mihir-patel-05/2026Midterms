import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatEtTime } from "@/features/election-monitor/constants";
import { useKalshiMarkets } from "@/features/election-monitor/useKalshiLive";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { partyColor, partyLetter } from "../party";
import { useWatchlist } from "../watchlist";
import { FAVORITE_MIN, isControl, marketLabel, MOVE_POINTS, type BigMove, type Divergence, type MarketAlert } from "./marketCount";
import { dismissMarketAlert, observeMarkets, useMarketCount } from "./marketCountStore";
import { boardOf, useLiveResults } from "./useLiveResults";

/** How often the tracker folds in the latest prices and results. */
export const MARKET_TICK_MS = 5_000;

const pctFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });


/**
 * Feeds the market vs count tracker every few seconds while the War Room is open, and shows a dismissable alert for
 * each new disagreement or big swing on a watchlist race or chamber control. Mounted once, in the shell, only while
 * the market_alerts switch is on.
 */
export function MarketWatcher() {
  const results = useLiveResults();
  const board = boardOf(results);
  const { markets, byRace } = useKalshiMarkets();
  const watch = useWatchlist(null, null);
  const latest = useRef({ board, markets, byRace, watched: watch.list });
  latest.current = { board, markets, byRace, watched: watch.list };

  useEffect(() => {
    const tick = () => observeMarkets(latest.current);
    tick();
    const timer = window.setInterval(tick, MARKET_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return <MarketAlertList />;
}

function MarketAlertList() {
  const { alerts } = useMarketCount();
  if (alerts.length === 0) return null;
  return (
    <aside className="wr-alerts wr-alerts-market" aria-label="Market vs count alerts">
      <ol role="status" aria-live="polite">
        {alerts.map((alert) => <MarketAlertItem key={alert.key} alert={alert} />)}
      </ol>
      {alerts.length > 1 && <button type="button" className="wr-btn" onClick={() => dismissMarketAlert()}>Dismiss all</button>}
    </aside>
  );
}

function RaceLink({ code, onClick }: { code: string; onClick?: () => void }) {
  const { search } = useLocation();
  if (isControl(code)) return <strong>{marketLabel(code)}</strong>;
  return (
    <Link className="wr-cell-btn" to={{ pathname: `/war-room/race/${code}`, search, hash: "results" }} onClick={onClick}>
      <strong>{marketLabel(code)}</strong>
    </Link>
  );
}

function MarketAlertItem({ alert }: { alert: MarketAlert }) {
  const dismiss = () => dismissMarketAlert(alert.key);
  const test = alert.divergence?.isTestData ? " · TEST DATA" : "";
  return (
    <li className="wr-alert">
      <div>
        <span className="wr-alert-eyebrow">{alert.kind === "divergence" ? "Market vs count" : "Market swing"}{test}</span>
        <p>
          <RaceLink code={alert.code} onClick={dismiss} />{" "}
          {alert.divergence ? <DivergenceText divergence={alert.divergence} /> : alert.move ? <MoveText move={alert.move} /> : null}
        </p>
        <span className="wr-dim">{formatEtTime(new Date(alert.seenAt).toISOString())} ET · market prices are not forecasts</span>
      </div>
      <button type="button" className="wr-alert-close" onClick={dismiss} aria-label={`Dismiss the ${marketLabel(alert.code)} alert`}>×</button>
    </li>
  );
}

function DivergenceText({ divergence }: { divergence: Divergence }) {
  const counted = divergence.pctCounted === null ? "" : ` with ${Math.round(divergence.pctCounted)}% counted`;
  return (
    <>
      <strong style={{ color: partyColor(divergence.leaderParty) }}>{divergence.leaderName} ({partyLetter(divergence.leaderParty)})</strong> leads the count{counted}, but Kalshi has the{" "}
      <strong style={{ color: partyColor(divergence.favorite.party) }}>{partyLetter(divergence.favorite.party)}</strong> side at {Math.round(divergence.favorite.price)}¢
    </>
  );
}

function MoveText({ move }: { move: BigMove }) {
  const up = move.to > move.from;
  return (
    <>
      <strong style={{ color: partyColor(move.party) }}>{move.outcome}</strong> {up ? "up" : "down"} {Math.round(Math.abs(move.to - move.from))} points, {Math.round(move.from)}¢ to {Math.round(move.to)}¢ since {formatEtTime(new Date(move.fromAt).toISOString())} ET
    </>
  );
}

/**
 * Every race where the count leader and the market favorite disagree, and every market that swung 20 points within the
 * hour, whether or not it is on the watchlist. Empty until results and prices are both in.
 */
export function MarketCountPanel({ compact = false }: { compact?: boolean }) {
  const { state } = useMarketCount();
  const { divergences, moves } = state;
  const shownDivergences = compact ? divergences.slice(0, 6) : divergences;
  const shownMoves = compact ? moves.slice(0, 4) : moves;
  return (
    <Panel title="Market vs count" meta={state.testData ? <Badge tone="mock">TEST DATA</Badge> : undefined}
      footnote={`Races where the count leader is not from the party Kalshi prices at ${FAVORITE_MIN}¢ or more, and markets that moved ${MOVE_POINTS} points within the hour, as seen by this browser since the War Room opened. Market prices are not forecasts.`}>
      {divergences.length === 0 && moves.length === 0 ? (
        <StatusLine>Nothing yet. The count and the markets agree, or results and prices are not both in.</StatusLine>
      ) : (
        <>
          {shownDivergences.length > 0 && (
            <div className="wr-table-wrap"><table className="wr-table wr-market-table">
              <thead><tr><th scope="col">Race</th><th scope="col">Count leader</th><th scope="col">Market</th></tr></thead>
              <tbody>
                {shownDivergences.map((divergence) => (
                  <tr key={divergence.key}>
                    <td><RaceLink code={divergence.code} /></td>
                    <td>
                      <span style={{ color: partyColor(divergence.leaderParty) }}>{divergence.leaderName} ({partyLetter(divergence.leaderParty)})</span>{" "}
                      <span className="wr-dim">{pctFormat.format(divergence.leaderPct)}%{divergence.pctCounted === null ? "" : ` · ${Math.round(divergence.pctCounted)}% in`}</span>
                    </td>
                    <td style={{ color: partyColor(divergence.favorite.party) }}>{partyLetter(divergence.favorite.party)} {Math.round(divergence.favorite.price)}¢</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {shownMoves.length > 0 && (
            <ul className="wr-market-moves">
              {shownMoves.map((move) => (
                <li key={move.ticker}><RaceLink code={move.code} /> <MoveText move={move} /></li>
              ))}
            </ul>
          )}
          {compact && (divergences.length > shownDivergences.length || moves.length > shownMoves.length) && (
            <p className="wr-dim">{divergences.length - shownDivergences.length + moves.length - shownMoves.length} more on the Night screen.</p>
          )}
        </>
      )}
    </Panel>
  );
}
