import { BIN_COLORS } from "@/features/election-monitor/pastResults";

const marginLabels = ["<1", "1–5", "5–10", "10–20", "20+"];

function Swatch({ color, label }: { color: string; label: string }) {
  return <i className="sim-swatch" style={{ background: color }} role="img" aria-label={label} title={label} />;
}

/** Same ramp as Past results: darker is closer. Calls you make use the Lean, Likely, and Safe steps. */
export function SimLegend() {
  return (
    <div className="sim-legend" aria-label="Map colours">
      {(["D", "R"] as const).map((party) => (
        <div className="sim-legend-row" key={party}>
          <span>{party === "D" ? "Democrat" : "Republican"}</span>
          {marginLabels.map((label, i) => <Swatch key={label} color={BIN_COLORS[`${party}${i}`]} label={`${party === "D" ? "Democrat" : "Republican"} by ${label} pts`} />)}
        </div>
      ))}
      <div className="sim-legend-row">
        <span>Tossup</span>
        <Swatch color={BIN_COLORS.tossup} label="Tossup" />
      </div>
      <p>Margin in points: {marginLabels.join(", ")}. Your calls shade Lean 1–5, Likely 5–10, Safe 20+.</p>
    </div>
  );
}
