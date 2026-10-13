import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { formatEtTime, partyTone, priceTypeLabel } from "./constants";
import { useControlOdds, type KalshiFeedStatus, type KalshiMarket } from "./useKalshiLive";

const statusCopy: Record<KalshiFeedStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "teal" },
  connecting: { label: "Connecting", tone: "muted" },
  degraded: { label: "Delayed", tone: "amber" },
  offline: { label: "Reconnecting", tone: "amber" },
  disabled: { label: "Snapshot", tone: "muted" },
};

function ControlBar({ chamber, markets }: { chamber: string; markets: KalshiMarket[] }) {
  const dem = markets.find((market) => market.party === "D");
  const rep = markets.find((market) => market.party === "R");
  if (!dem?.pricePercent || !rep?.pricePercent) return null;
  // Yes prices on both sides rarely sum to exactly 100; scale the bar, label the real prices.
  const demShare = (dem.pricePercent / (dem.pricePercent + rep.pricePercent)) * 100;
  return (
    <a className="em-control" href={dem.url} target="_blank" rel="noopener noreferrer"
      aria-label={`${chamber} control on Kalshi: Democrats ${dem.pricePercent.toFixed(1)}%, Republicans ${rep.pricePercent.toFixed(1)}%`}>
      <div className="em-control-head">
        <span>{chamber} control</span>
        <ExternalLink aria-hidden="true" />
      </div>
      <div className="em-control-values">
        <strong key={`d-${dem.updatedAt}`} data-moved={dem.moved} style={{ color: partyTone("DEM").fg }}>D {dem.pricePercent.toFixed(1)}%</strong>
        <strong key={`r-${rep.updatedAt}`} data-moved={rep.moved} style={{ color: partyTone("REP").fg }}>R {rep.pricePercent.toFixed(1)}%</strong>
      </div>
      <div className="em-control-bar" aria-hidden="true"
        style={{ "--dem": `${demShare}%`, "--dem-color": partyTone("DEM").fg, "--rep-color": partyTone("REP").fg } as CSSProperties}>
        <span />
      </div>
    </a>
  );
}

/** National House and Senate control prices from Kalshi; hidden when neither is available. */
export function ControlOddsBanner() {
  const { status, house, senate } = useControlOdds();
  if (house.length === 0 && senate.length === 0) return null;
  const badge = statusCopy[status];
  const priced = [...house, ...senate].filter((market) => market.pricePercent !== null);
  const priceType = priceTypeLabel(priced.map((market) => market.priceType));
  const lastChange = priced.reduce((latest, market) => (market.updatedAt > latest ? market.updatedAt : latest), "");
  return (
    <section className="em-control-banner" aria-label="Kalshi chamber control markets">
      <div className="em-control-meta">
        <span className="em-eyebrow">Kalshi markets</span>
        <span className="em-pill" data-tone={badge.tone}>{status === "live" && <span className="em-live-dot" aria-hidden="true" />}{badge.label}</span>
      </div>
      <ControlBar chamber="House" markets={house} />
      <ControlBar chamber="Senate" markets={senate} />
      <p className="em-control-note">
        Market prices{priceType ? ` (${priceType})` : ""}{lastChange ? `, last changed ${formatEtTime(lastChange)} ET` : ""}. Not forecasts or results.
      </p>
    </section>
  );
}
