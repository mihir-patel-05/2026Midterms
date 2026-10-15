import { Link2, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { BASELINE_NOTES } from "./electoralVotes";
import { swingLabel } from "./labels";
import { BASE_YEARS, SWING_LIMIT } from "./useSimulatorParams";

/** Baseline election, national swing, and the reset and share buttons. */
export function SimulatorControls({ base, swing, onBaseChange, onSwingChange, onReset, onCopyLink }: {
  base: number | null;
  swing: number;
  onBaseChange: (base: number | null) => void;
  onSwingChange: (swing: number) => void;
  onReset: () => void;
  onCopyLink: () => void;
}) {
  return (
    <section className="sim-controls" aria-label="Scenario">
      <label className="sim-field">
        <span>Start from</span>
        <select value={base ?? "blank"} onChange={(event) => onBaseChange(event.target.value === "blank" ? null : Number(event.target.value))}>
          {BASE_YEARS.map((year) => <option key={year} value={year}>{year} results</option>)}
          <option value="blank">Blank map</option>
        </select>
      </label>
      <div className="sim-field sim-swing">
        <span id="sim-swing-label">National swing</span>
        <div className="sim-swing-row">
          <span className="sim-swing-end" data-party="R" aria-hidden="true">R</span>
          <Slider
            aria-labelledby="sim-swing-label"
            aria-valuetext={swingLabel(swing)}
            min={-SWING_LIMIT}
            max={SWING_LIMIT}
            step={0.5}
            value={[swing]}
            disabled={base === null}
            onValueChange={([value]) => onSwingChange(value)}
          />
          <span className="sim-swing-end" data-party="D" aria-hidden="true">D</span>
          <output className="sim-swing-value" aria-hidden="true">{swingLabel(swing)}</output>
        </div>
      </div>
      <div className="sim-actions">
        <button type="button" className="sim-button" onClick={onReset}><RotateCcw aria-hidden="true" />Reset</button>
        <button type="button" className="sim-button" onClick={onCopyLink}><Link2 aria-hidden="true" />Copy link</button>
      </div>
      {base !== null && (
        <p className="sim-note">
          {base !== 2024 && `Uses today's electoral votes (2020 census), not those of ${base}. `}
          {BASELINE_NOTES[base]}
        </p>
      )}
    </section>
  );
}
