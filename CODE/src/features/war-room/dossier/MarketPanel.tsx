import { useState } from "react";
import { historyByTicker, historyStart, useMarketHistory } from "@/features/election-monitor/marketHistory";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { PriceTrace } from "../charts";
import { etDate } from "../countdown";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor, partyLetter } from "../party";
import { HOUR_MS, priceRange } from "../trace";

const RANGES = [7, 14, 30];

/** Every priced outcome's hourly Kalshi price over 7, 14 or 30 days, gaps kept. */
export function MarketPanel({ id, code, markets }: { id: string; code: string; markets: KalshiMarket[] }) {
  const [days, setDays] = useState(14);
  const history = useMarketHistory([code], days);
  const byTicker = historyByTicker(history.data);
  const end = Date.now();
  const start = end - days * 24 * HOUR_MS;
  const series = markets
    .map((market) => ({ key: market.ticker, label: `${partyLetter(market.party)} · ${market.outcome}`, color: partyColor(market.party), points: byTicker.get(market.ticker)?.points ?? [] }))
    .filter((item) => item.points.length > 0);
  const range = priceRange(series.map((item) => item.points));
  const guides = [range[0], (range[0] + range[1]) / 2, range[1]].map((value) => Math.round(value / 5) * 5).filter((value, i, all) => all.indexOf(value) === i);
  const first = historyStart(history.data);
  const ticks = Array.from({ length: 5 }, (_, i) => start + ((end - start) * i) / 4);
  const summary = series.map((item) => `${item.label} ${item.points[0][1]} to ${item.points[item.points.length - 1][1]} cents`).join("; ");

  return (
    <Panel id={id} title="Market history · Kalshi · hourly snapshots"
      meta={<>
        {series.map((item) => <span key={item.key} className="wr-key"><span style={{ background: item.color }} aria-hidden="true" />{item.label}</span>)}
        <div className="wr-seg" role="group" aria-label="Range">
          {RANGES.map((value) => <button key={value} type="button" aria-pressed={value === days} onClick={() => setDays(value)}>{value}D</button>)}
        </div>
      </>}
      footnote={`Midpoint prices · hours with no stored price stay as gaps${first && first > start ? ` · history starts ${etDate(first)}` : ""} · not a forecast`}>
      {history.isLoading ? <StatusLine>Loading market history…</StatusLine>
        : history.isError ? <StatusLine tone="warn">Market history unavailable</StatusLine>
          : series.length === 0 ? <StatusLine>{markets.length ? "No stored prices in this window yet" : "No Kalshi market for this race"}</StatusLine>
            : (
              <>
                <PriceTrace series={series} domain={[start, end]} range={range} guides={guides} height={220} label={`Kalshi hourly prices over ${days} days: ${summary}`} />
                <div className="wr-axis">{ticks.map((tick, i) => <span key={tick}>{i === 4 ? `${etDate(tick)} · now` : etDate(tick)}</span>)}</div>
              </>
            )}
    </Panel>
  );
}
