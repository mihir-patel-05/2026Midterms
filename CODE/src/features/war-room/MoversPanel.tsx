import { useState } from "react";
import { historyByTicker, useMarketHistory, useMarketMovers, type Mover, type MoversData, type MoversWindow } from "@/features/election-monitor/marketHistory";
import { Spark } from "./charts";
import { etDate } from "./countdown";
import { moverRace } from "./feed";
import { Panel, StatusLine } from "./panels/Panel";
import { partyColor, partyLetter } from "./party";
import { WATCH_DAYS } from "./queries";
import { cents } from "./seatTally";
import { HOUR_MS } from "./trace";

const WINDOWS: Array<{ value: MoversWindow; label: string; hours: number; long: string }> = [
  { value: "24h", label: "24H", hours: 24, long: "past 24 hours" },
  { value: "7d", label: "7D", hours: 168, long: "past 7 days" },
];

/** Why the list is empty, in words: "no movement" and "not enough history yet" are different answers. */
function emptyNote(data: MoversData, window: (typeof WINDOWS)[number]) {
  if (!data.asOf) return "No Kalshi prices have been stored yet.";
  if (data.historyStart) {
    const available = Date.parse(data.historyStart) + window.hours * HOUR_MS;
    if (available > Date.parse(data.asOf)) return `Prices stored hourly since ${etDate(Date.parse(data.historyStart))}; ${window.label} changes start ${etDate(available)}.`;
  }
  return `No race moved 1 point or more in the ${window.long}.`;
}

/**
 * The races whose Kalshi price moved most, from the stored hourly snapshots. Each race appears once, under the
 * outcome that gained, so neither party is favoured by the wording. `detailed` adds the starting price and a rank.
 */
export function MoversPanel({ initial = "24h", detailed = false, onSelect }: {
  initial?: MoversWindow;
  detailed?: boolean;
  /** Target a race on the map; national control markets have no state and are not buttons. */
  onSelect?: (mover: Mover) => void;
}) {
  const [windowValue, setWindowValue] = useState<MoversWindow>(initial);
  const window = WINDOWS.find((item) => item.value === windowValue)!;
  const movers = useMarketMovers(windowValue, null);
  const list = movers.data?.movers ?? [];
  const byTicker = historyByTicker(useMarketHistory(list.map((mover) => mover.race), WATCH_DAYS).data);
  const end = Date.now();
  const domain: [number, number] = [end - WATCH_DAYS * 24 * HOUR_MS, end];
  const left = movers.data ? movers.data.excluded.noBaseline + movers.data.excluded.thinQuote : 0;

  return (
    <Panel flush title="Biggest movers"
      meta={<div className="wr-seg" role="group" aria-label="Change over">
        {WINDOWS.map((item) => <button key={item.value} type="button" aria-pressed={item.value === windowValue} onClick={() => setWindowValue(item.value)}>{item.label}</button>)}
      </div>}
      footnote={movers.data?.asOf ? `Midpoints, spread ≤15${left ? ` · ${left} markets left out (no baseline or thin quote)` : ""} · to ${etDate(Date.parse(movers.data.asOf))} · not a forecast` : undefined}>
      {movers.isLoading && <StatusLine>Loading market changes…</StatusLine>}
      {movers.isError && <StatusLine tone="warn">Market changes unavailable</StatusLine>}
      {movers.data && list.length === 0 && <StatusLine>{emptyNote(movers.data, window)}</StatusLine>}
      {list.length > 0 && (
        <div className="wr-table-wrap">
          <table className="wr-table">
            <thead>
              <tr>
                {detailed && <th scope="col">#</th>}
                <th scope="col">Race</th>
                <th scope="col">Gained</th>
                {detailed && <th scope="col" className="wr-num">From</th>}
                <th scope="col" className="wr-num">Now</th>
                <th scope="col" className="wr-num">Δ {window.label}</th>
                <th scope="col">{WATCH_DAYS}D trace</th>
              </tr>
            </thead>
            <tbody>
              {list.map((mover, index) => {
                const race = moverRace(mover);
                const selectable = Boolean(onSelect && mover.stateCode);
                return (
                  <tr key={mover.race}>
                    {detailed && <td className="wr-dim">{String(index + 1).padStart(2, "0")}</td>}
                    <td>
                      {selectable
                        ? <button type="button" className="wr-cell-btn" onClick={() => onSelect!(mover)} aria-label={`${race}: ${mover.outcome} up ${mover.changePts.toFixed(1)} points to ${cents(mover.toPct)}. Show on the map`}>{race}</button>
                        : <strong>{race}</strong>}
                    </td>
                    <td style={{ color: partyColor(mover.party ?? "O") }} title={mover.outcome}>{mover.party ? partyLetter(mover.party) : mover.outcome}</td>
                    {detailed && <td className="wr-num">{cents(mover.fromPct)}</td>}
                    <td className="wr-num">{cents(mover.toPct)}</td>
                    <td className="wr-num wr-accent">+{mover.changePts.toFixed(1)}</td>
                    <td><Spark points={byTicker.get(mover.ticker)?.points ?? []} domain={domain} color={partyColor(mover.party ?? "O")} width={detailed ? 110 : 72} /></td>
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
