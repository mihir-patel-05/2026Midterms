import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatEtTime } from "@/features/election-monitor/constants";
import { partyColor } from "../party";
import { raceLabel } from "../raceCodes";
import { useWatchlist } from "../watchlist";
import { dismissAlert, observeBoard, useCallTracker } from "./callTracker";
import { boardOf, useLiveResults } from "./useLiveResults";

/**
 * Feeds every results refresh to the call tracker (for the call log's retractions), and, when `alerts` is on, shows
 * a dismissable alert for each race on the watchlist that the decision desk calls while the War Room is open. Calls
 * already in the first board this tab loads never alert.
 */
export function CallWatcher({ alerts }: { alerts: boolean }) {
  const results = useLiveResults();
  const board = boardOf(results);
  const watch = useWatchlist(null, null);
  useEffect(() => {
    if (board) observeBoard(board, watch.list);
    // The board changes once per refresh; the watchlist is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);
  return alerts ? <CallAlerts /> : null;
}

function CallAlerts() {
  const { search } = useLocation();
  const { alerts } = useCallTracker();
  if (alerts.length === 0) return null;
  return (
    <aside className="wr-alerts" aria-label="Watchlist race calls">
      <ol role="status" aria-live="polite">
        {alerts.map((alert) => (
          <li key={`${alert.key}-${alert.seenAt}`} className="wr-alert">
            <div>
              <span className="wr-alert-eyebrow">Watchlist call{alert.isTestData ? " · TEST DATA" : ""}</span>
              <p>
                <Link className="wr-cell-btn" to={{ pathname: `/war-room/race/${alert.code}`, search, hash: "results" }} onClick={() => dismissAlert(alert.key)}>
                  <strong>{raceLabel(alert.code)}</strong>
                </Link>{" "}
                called for <strong style={{ color: partyColor(alert.party) }}>{alert.name}</strong> ({alert.partyName ?? "no party"})
              </p>
              <span className="wr-dim">{alert.calledBy} · {formatEtTime(alert.calledAt)} ET · a projection, not a certified result</span>
            </div>
            <button type="button" className="wr-alert-close" onClick={() => dismissAlert(alert.key)} aria-label={`Dismiss the ${raceLabel(alert.code)} alert`}>×</button>
          </li>
        ))}
      </ol>
      {alerts.length > 1 && <button type="button" className="wr-btn" onClick={() => dismissAlert()}>Dismiss all</button>}
    </aside>
  );
}
