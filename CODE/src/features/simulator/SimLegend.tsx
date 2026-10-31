import { BIN_COLORS } from "@/features/election-monitor/pastResults";
import { ratingLabels } from "./labels";
import { ratingBin, type Rating } from "./model";

/** Lightest to deepest, as the legend reads left to right. */
const RATINGS: Rating[] = ["lean", "likely", "safe"];

function Swatch({ color, label }: { color: string; label: string }) {
  return <i className="sim-swatch" style={{ background: color }} role="img" aria-label={label} title={label} />;
}

/** Rating shades, as on a race-ratings map: Safe is deepest, Likely in between, Lean lightest. */
export function SimLegend({ note }: { note?: string }) {
  return (
    <div className="sim-legend" aria-label="Map colours">
      {(["D", "R"] as const).map((party) => (
        <div className="sim-legend-row" key={party}>
          <span>{party === "D" ? "Democrat" : "Republican"}</span>
          {RATINGS.map((rating) => <Swatch key={rating} color={BIN_COLORS[ratingBin(party, rating)]} label={`${ratingLabels[rating]} ${party === "D" ? "Democrat" : "Republican"}`} />)}
        </div>
      ))}
      <div className="sim-legend-row">
        <span>Tossup</span>
        <Swatch color={BIN_COLORS.tossup} label="Tossup" />
      </div>
      <p>Lean (under 5 pts), Likely (5–10), Safe (10+), from lightest to deepest. {note ?? "Simulated margins and your calls use the same shades."}</p>
    </div>
  );
}
