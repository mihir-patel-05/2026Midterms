import { historyByTicker, useMarketHistory } from "@/features/election-monitor/marketHistory";
import type { OddsView } from "@/features/election-monitor/oddsMap";
import { useControlOdds, type KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { VICE_PRESIDENT } from "@/features/simulator/midterms/races2026";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor } from "../party";
import { cents, houseTally, senateTally, type ChamberTally, type SideTally } from "../seatTally";
import { CONTROL_DAYS, CONTROL_RACES } from "../queries";
import { changeOver, moveArrow, signedPoints } from "../trace";

function parts(side: SideTally) {
  const out: string[] = [];
  if (side.notUp) out.push(`${side.notUp} not up`);
  out.push(`${side.leading} leading`);
  if (side.byHolder) out.push(`${side.byHolder} unpriced, by holder`);
  return out;
}

function TallyBar({ tally }: { tally: ChamberTally }) {
  const { d, r, other, unknown } = tally;
  const segments: Array<[string, number, string]> = [
    ["d-held", d.notUp + d.byHolder, "var(--wr-dem-deep)"],
    ["d-lead", d.leading, "var(--wr-dem)"],
    ["other", other, "var(--wr-ind)"],
    ["unknown", unknown, "var(--wr-line-strong)"],
    ["r-lead", r.leading, "var(--wr-rep)"],
    ["r-held", r.notUp + r.byHolder, "var(--wr-rep-deep)"],
  ];
  return (
    <div className="wr-tally-bar" aria-hidden="true">
      {segments.filter(([, count]) => count > 0).map(([key, count, color]) => <span key={key} style={{ flex: count, background: color }} />)}
      <span className="wr-tally-mid" />
    </div>
  );
}

function ControlCard({ chamber, markets, view, history, offline }: {
  chamber: "Senate" | "House";
  markets: KalshiMarket[];
  offline: boolean;
  view: OddsView | null;
  history: ReturnType<typeof historyByTicker>;
}) {
  const house = chamber === "House";
  const dem = markets.find((market) => market.party === "D");
  const rep = markets.find((market) => market.party === "R");
  const priced = dem?.pricePercent != null && rep?.pricePercent != null;
  const leader = priced ? (dem!.pricePercent! >= rep!.pricePercent! ? dem! : rep!) : null;
  const move = leader ? changeOver(history.get(leader.ticker)?.points ?? [], 24) : null;
  const tally = view ? (house ? houseTally(view) : senateTally(view)) : null;
  const rule = house ? "218 to control · 435 seats" : `51 to control · VP tiebreak ${VICE_PRESIDENT.party}`;
  return (
    <Panel title={`${chamber} · control`} meta={<>{rule}{dem && <a href={dem.url} target="_blank" rel="noopener noreferrer">Kalshi ↗</a>}</>}
      footnote={tally ? `Seats by market leader, not a forecast${tally.unknown ? ` · ${tally.unknown} unpriced, holder not loaded` : ""}${tally.other ? ` · ${tally.other} led by an independent` : ""}` : undefined}>
      {priced ? (
        <div className="wr-control-prices">
          <strong style={{ color: partyColor("D") }}>D {cents(dem!.pricePercent!)}</strong>
          <strong style={{ color: partyColor("R") }}>R {cents(rep!.pricePercent!)}</strong>
          <span style={{ color: move === null ? undefined : partyColor(leader!.party) }}>
            {move === null ? "24H —" : `${moveArrow(move)} ${leader!.party} ${signedPoints(move)} / 24H`.trim()}
          </span>
        </div>
      ) : (
        <StatusLine tone={offline ? "warn" : undefined}>{markets.length ? "Kalshi control market open, no price yet" : offline ? "Kalshi feed offline · no price" : `No Kalshi ${chamber} control price yet`}</StatusLine>
      )}
      {tally ? (
        <>
          <TallyBar tally={tally} />
          <div className="wr-tally-text">
            <span><strong style={{ color: partyColor("D") }}>D {tally.d.total}</strong> · {parts(tally.d).join(" + ")}</span>
            <span>{parts(tally.r).reverse().join(" + ")} · <strong style={{ color: partyColor("R") }}>R {tally.r.total}</strong></span>
          </div>
        </>
      ) : <StatusLine>Seat count appears when race prices load</StatusLine>}
    </Panel>
  );
}

/** Senate and House control prices, with each chamber's seat count by market leader. */
export function ChamberControl({ senate, house }: { senate: OddsView | null; house: OddsView | null }) {
  const odds = useControlOdds();
  const history = historyByTicker(useMarketHistory(CONTROL_RACES, CONTROL_DAYS).data);
  return (
    <>
      <ControlCard chamber="Senate" markets={odds.senate} view={senate} history={history} offline={odds.status === "offline"} />
      <ControlCard chamber="House" markets={odds.house} view={house} history={history} offline={odds.status === "offline"} />
    </>
  );
}
