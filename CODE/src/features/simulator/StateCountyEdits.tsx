import { X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { swingLabel } from "./labels";
import { formatMargin } from "./model";
import { SWING_LIMIT } from "./useSimulatorParams";

/** A state's own swing, on top of the national one, and the counties set by hand there. */
export function StateCountyEdits({ swing, edits, names, onSwingChange, onSelectCounty, onResetCounty, onResetAll, onEditCounties }: {
  swing: number;
  /** FIPS and margin of each county set by hand in this state. */
  edits: Array<[string, number]>;
  names: Map<string, string> | undefined;
  onSwingChange: (swing: number) => void;
  onSelectCounty: (fips: string) => void;
  onResetCounty: (fips: string) => void;
  onResetAll: () => void;
  /** Switches the map to counties; omitted when it already shows them. */
  onEditCounties?: () => void;
}) {
  return (
    <>
      <div className="sim-field">
        <span id="sim-state-swing">State swing</span>
        <div className="sim-swing-row">
          <span className="sim-swing-end" data-party="R" aria-hidden="true">R</span>
          <Slider
            aria-labelledby="sim-state-swing"
            aria-valuetext={swingLabel(swing)}
            min={-SWING_LIMIT}
            max={SWING_LIMIT}
            step={0.5}
            value={[swing]}
            onValueChange={([value]) => onSwingChange(value)}
          />
          <span className="sim-swing-end" data-party="D" aria-hidden="true">D</span>
          <output className="sim-swing-value" aria-hidden="true">{swingLabel(swing)}</output>
        </div>
        <small className="sim-hint">Added to the national swing, for this state's counties only.</small>
      </div>

      <div className="sim-county-edits">
        <div className="sim-card-head">
          <h3>Counties you set</h3>
          {edits.length > 0 && <button type="button" className="sim-link" onClick={onResetAll}>Reset all</button>}
        </div>
        {edits.length === 0 ? (
          <p className="sim-note">
            None yet.{" "}
            {onEditCounties
              ? <button type="button" className="sim-link" onClick={onEditCounties}>Show counties on the map</button>
              : "Click a county on the map to set its margin."}
          </p>
        ) : (
          <ul>
            {edits.map(([fips, margin]) => (
              <li key={fips}>
                <button type="button" className="sim-link" onClick={() => onSelectCounty(fips)}>{names?.get(fips) ?? fips}</button>
                <span className="sim-result" data-party={margin > 0 ? "D" : margin < 0 ? "R" : "T"}>{formatMargin(margin)}</span>
                <button type="button" className="sim-icon-button" aria-label={`Reset ${names?.get(fips) ?? fips}`} onClick={() => onResetCounty(fips)}><X aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
