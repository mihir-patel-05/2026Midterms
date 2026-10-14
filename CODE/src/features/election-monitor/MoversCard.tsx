import { useState } from "react";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { districtLabel, formatEtTime, partyTone } from "./constants";
import { historyByTicker, useMarketHistory, useMarketMovers, type Mover, type MoversData, type MoversWindow } from "./marketHistory";
import { Sparkline } from "./Sparkline";

const WINDOWS: Array<{ value: MoversWindow; label: string; adjective: string; long: string; hours: number }> = [
  { value: "24h", label: "24 hours", adjective: "24-hour", long: "past 24 hours", hours: 24 },
  { value: "7d", label: "7 days", adjective: "7-day", long: "past 7 days", hours: 168 },
];
const SPARK_DAYS = 7;
const HOUR_MS = 3_600_000;

/** "Oct 14" in Eastern time, to match the ET clock times beside it. */
const etDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

function raceName(mover: Mover) {
  if (mover.scope === "NATIONAL_HOUSE") return "House control";
  if (mover.scope === "NATIONAL_SENATE") return "Senate control";
  if (mover.scope === "STATE_SENATE") return `${mover.stateCode} Senate`;
  return districtLabel(mover.stateCode!, mover.district);
}

function outcomeName(mover: Mover) {
  return `${mover.outcome}${mover.party ? ` (${mover.party})` : ""}`;
}

/** Why the list is empty, in words. "No movement" and "not enough history yet" are different answers. */
function emptyNote(data: MoversData, active: (typeof WINDOWS)[number]) {
  if (!data.asOf) return "No Kalshi prices have been stored yet.";
  if (data.historyStart) {
    const available = new Date(data.historyStart).getTime() + active.hours * HOUR_MS;
    if (available > new Date(data.asOf).getTime()) {
      return `Prices have been stored hourly since ${etDate(data.historyStart)}, so ${active.adjective} changes are available from ${etDate(new Date(available).toISOString())}.`;
    }
  }
  return `No race's price moved by 1 point or more in the ${active.long}.`;
}

/**
 * Races whose Kalshi price moved most over a fixed window, from stored hourly snapshots.
 * Each race appears once, under the outcome that gained, so neither party is favoured by the wording.
 */
export function MoversCard({ stateCode, onSelect }: {
  stateCode: string | null;
  onSelect: (state: string, district: string | null) => void;
}) {
  const [windowValue, setWindowValue] = useState<MoversWindow>("24h");
  const active = WINDOWS.find((item) => item.value === windowValue)!;
  const movers = useMarketMovers(windowValue, stateCode);
  const list = movers.data?.movers ?? [];
  const history = useMarketHistory(list.map((mover) => mover.race), SPARK_DAYS);
  const byTicker = historyByTicker(history.data);
  const end = Date.now();
  const domain: [number, number] = [end - SPARK_DAYS * 24 * HOUR_MS, end];
  const excludedCount = movers.data ? movers.data.excluded.noBaseline + movers.data.excluded.thinQuote : 0;

  return (
    <section className="em-rail-card em-movers" aria-labelledby="em-movers-heading">
      <div className="em-rail-head">
        <h2 id="em-movers-heading">Biggest movers{stateCode ? ` · ${stateCode}` : ""}</h2>
        <div className="em-movers-windows" role="group" aria-label="Change over">
          {WINDOWS.map((item) => (
            <button key={item.value} type="button" aria-pressed={item.value === windowValue} onClick={() => setWindowValue(item.value)}>{item.label}</button>
          ))}
        </div>
      </div>

      {movers.isLoading && <p className="em-rail-empty" role="status">Loading market changes…</p>}
      {movers.isError && <p className="em-rail-empty" role="status">Market changes are unavailable right now.</p>}
      {movers.data && list.length === 0 && <p className="em-rail-empty">{emptyNote(movers.data, active)}</p>}

      {list.length > 0 && (
        <ol className="em-movers-list">
          {list.map((mover) => {
            const tone = partyTone(mover.party === "D" ? "DEM" : mover.party === "R" ? "REP" : null);
            const summary = `${raceName(mover)}: ${outcomeName(mover)} up ${mover.changePts.toFixed(1)} points, from ${mover.fromPct.toFixed(1)}% to ${mover.toPct.toFixed(1)}%`;
            const body = (
              <>
                <span className="em-movers-race">{raceName(mover)}</span>
                <span className="em-movers-outcome">{outcomeName(mover)}</span>
                <span className="em-movers-spark">
                  <Sparkline domain={domain} width={72} height={20} title={`${outcomeName(mover)}, hourly price, past ${SPARK_DAYS} days`}
                    series={[{ key: mover.ticker, label: mover.party ?? mover.outcome, color: tone.fg, points: byTicker.get(mover.ticker)?.points ?? [] }]} />
                </span>
                <span className="em-movers-prices">{mover.fromPct.toFixed(1)}% → {mover.toPct.toFixed(1)}%</span>
                <strong className="em-movers-change"><ArrowUpRight aria-hidden="true" />+{mover.changePts.toFixed(1)} pts</strong>
              </>
            );
            return (
              <li key={mover.race}>
                {mover.stateCode
                  ? <button type="button" aria-label={`${summary}. Show on map`} onClick={() => onSelect(mover.stateCode!, mover.scope === "HOUSE_DISTRICT" ? mover.district : null)}>{body}</button>
                  : mover.url
                    ? <a href={mover.url} target="_blank" rel="noopener noreferrer" aria-label={`${summary}. Open on Kalshi`}>{body}<ExternalLink className="em-movers-external" aria-hidden="true" /></a>
                    : <div aria-label={summary}>{body}</div>}
              </li>
            );
          })}
        </ol>
      )}

      {movers.data?.asOf && (
        <p className="em-movers-note">
          Kalshi market prices, stored hourly. Change in points over the {active.long} to {formatEtTime(movers.data.asOf)} ET, {etDate(movers.data.asOf)}. Not a forecast or result.
          {excludedCount > 0 && ` ${excludedCount} priced ${excludedCount === 1 ? "market" : "markets"} left out: ${movers.data.excluded.noBaseline} with no stored price ${active.label} earlier, ${movers.data.excluded.thinQuote} with a thin or last-trade-only quote.`}
        </p>
      )}
      <details className="em-movers-method">
        <summary>How this is ranked</summary>
        <ul>
          <li>Each market's newest stored hourly price is compared with its price {active.label} earlier (the nearest stored hour up to 6 hours before that point).</li>
          <li>Both prices must be bid/ask midpoints with a spread of 15 points or less. Last-trade-only and thin quotes are left out, not counted as zero.</li>
          <li>Each race is listed once, under the outcome whose price rose most. In a two-outcome race the other outcome fell by about the same amount.</li>
          <li>Races that moved less than 1 point are not listed. Largest change first; ties are ordered by race.</li>
          <li>A price change shows what traders paid, not why. It is not a forecast.</li>
        </ul>
      </details>
    </section>
  );
}
