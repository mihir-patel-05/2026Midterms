import { formatEtTime, formatShortDate, numberFormat } from "./constants";
import { REDISTRICTED_STATES } from "./map/redistricting";
import { HATCH_BACKGROUND, ODDS_BREAKS, ODDS_COLORS, ODDS_OFFICES, ODDS_STATUS_COLORS, oddsBinLabels, type OddsOffice, type OddsView } from "./oddsMap";
import { Swatch } from "./PastResultsControls";
import type { KalshiFeedStatus } from "./useKalshiLive";

const officeLabels: Record<OddsOffice, string> = { senate: "U.S. Senate", house: "U.S. House" };
// Keep the legend in step with the bin edges if they ever change.
if (ODDS_BREAKS.length !== oddsBinLabels.length - 1) throw new Error("Legend labels are out of step with the bins");

/** Senate or House picker for the Market odds map, with how many races have a price. */
export function OddsControls({ office, view, onChange }: { office: OddsOffice; view: OddsView | null; onChange: (office: OddsOffice) => void }) {
  const unit = office === "senate" ? "Senate races" : "House races";
  return (
    <div className="em-past-controls" role="group" aria-label="Market odds options">
      <div className="em-seg" role="group" aria-label="Chamber">
        {ODDS_OFFICES.map((item) => (
          <button key={item} type="button" aria-pressed={item === office} onClick={() => onChange(item)}>{officeLabels[item]}</button>
        ))}
      </div>
      {view && view.withMarket > 0 && (
        <span className="em-past-select">{numberFormat.format(view.priced)} of {numberFormat.format(view.total)} {unit} priced on Kalshi</span>
      )}
    </div>
  );
}

/** Legend, method, and price caveat for the Market odds map. */
export function OddsLegend({ office, view, status, holdersAsOf }: {
  office: OddsOffice;
  view: OddsView | null;
  status: KalshiFeedStatus;
  /** Date of the House seat-holders file; null until it loads. */
  holdersAsOf: string | null;
}) {
  const feedDown = (status === "offline" || status === "disabled") && (!view || view.withMarket === 0);
  const redistricted = [...REDISTRICTED_STATES].sort();
  const greys: Array<[string, string]> = [
    ...(office === "senate" ? [[ODDS_STATUS_COLORS.no_race, "No Senate race in 2026"] as [string, string]] : []),
    [ODDS_STATUS_COLORS.no_market, "No open Kalshi market"],
    [ODDS_STATUS_COLORS.no_price, "No price yet"],
    [ODDS_STATUS_COLORS.even, "Top outcomes priced the same"],
  ];
  return (
    <div className="em-past-legend">
      <p className="em-past-label">
        <strong>Kalshi market prices</strong>{view?.priceType ? ` (${view.priceType})` : ""}{view?.lastChange ? `, last changed ${formatEtTime(view.lastChange)} ET` : ""}. Not forecasts or results.
      </p>
      {feedDown && <p className="em-note" role="status">Live Kalshi feed unavailable. Races stay grey until prices arrive.</p>}
      <table className="em-past-ramp">
        <caption className="sr-only">Party the market prices highest, and its price in percent</caption>
        <thead><tr><th scope="col"><span className="sr-only">Leader</span></th>{oddsBinLabels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {([["D", "Democrat"], ["R", "Republican"], ["O", "Ind./other"]] as const).map(([party, name]) => (
            <tr key={party}>
              <th scope="row">{name}</th>
              {oddsBinLabels.map((label, i) => <td key={label}><Swatch color={ODDS_COLORS[`${party}${i}`]} label={`${name} leads at ${label}`} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="em-past-greys">
        <li><Swatch color={`${HATCH_BACKGROUND}, ${ODDS_COLORS.D1}`} />Leader differs from the party holding the seat</li>
        {greys.map(([color, label]) => <li key={label}><Swatch color={color} />{label}</li>)}
      </ul>
      {office === "house" && redistricted.length > 0 && (
        <p className="em-note" role="note">
          {redistricted.join(", ")} adopted new districts for 2026. Their shapes are 2024 lines (dashed amber); the colours are the 2026 market for that district number.
        </p>
      )}
      <details className="em-past-method">
        <summary>How this is calculated</summary>
        <ul>
          <li>Each {office === "senate" ? "state" : "district"} is coloured by the outcome its Kalshi market prices highest. The shade is that outcome's price: paler is closer to a toss-up.</li>
          <li>Prices are the bid/ask midpoint when both sides are quoted, otherwise the last trade. They move with trading and are not probabilities from a model.</li>
          <li>A race with no market or no price is grey, never shown as 50/50.</li>
          <li>Hatching marks a race whose leader is from a different party than the member holding the seat today. A vacant seat is compared with its last holder, and an independent holder counts as neither party. Redistricted House seats are never hatched.</li>
          {office === "house" && <li>House seat holders: congress-legislators{holdersAsOf ? `, as of ${formatShortDate(holdersAsOf)}` : ""}.</li>}
          {office === "house" && <li>Kalshi lists about 415 of the 435 House races; the rest are grey.</li>}
        </ul>
      </details>
    </div>
  );
}
