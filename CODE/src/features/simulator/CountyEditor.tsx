import { ArrowLeft } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { ELECTORAL_VOTES } from "./electoralVotes";
import { outcomeWords, STATE_NAMES } from "./labels";
import { formatMargin, type StateOutcome } from "./model";

/** County margins can run past 90 points; the two-party vote caps what a setting can reach. */
const LIMIT = 100;

/**
 * One county's margin. Setting it re-splits the county's two-party vote (turnout stays), and the
 * state's result is recomputed from all its counties.
 */
export function CountyEditor({ name, state, baseMargin, margin, edited, base, outcome, onSet, onClearPick, onClose }: {
  name: string;
  state: StateOutcome;
  /** The baseline election's margin, or null when the county has no returns in the data. */
  baseMargin: number | null;
  /** Simulated margin: the hand-set value, or the baseline plus swing. */
  margin: number | null;
  edited: boolean;
  base: number;
  /** What the state's margin decides, e.g. "16 electoral votes to Democrats"; defaults to its electoral votes. */
  outcome?: string;
  /** null clears the county's setting. */
  onSet: (margin: number | null) => void;
  onClearPick: () => void;
  onClose: () => void;
}) {
  const stateName = STATE_NAMES[state.code] ?? state.code;

  if (baseMargin === null || margin === null) {
    return (
      <section className="sim-card" aria-labelledby="sim-county-heading">
        <button type="button" className="sim-back" onClick={onClose}><ArrowLeft aria-hidden="true" />{stateName}</button>
        <h2 id="sim-county-heading">{name}</h2>
        <p className="sim-note">
          {state.code === "AK"
            ? "Alaska reports presidential results by state house district, not by borough, so its counties can't be set one by one."
            : `The ${base} returns have no results for this county.`}{" "}
          Set {stateName} as a whole instead.
        </p>
      </section>
    );
  }

  const set = (value: number) => onSet(Math.max(-LIMIT, Math.min(LIMIT, Math.round(value * 10) / 10)));
  const decides = outcome ?? `${ELECTORAL_VOTES[state.code]} electoral votes to ${outcomeWords[state.winner]}`;
  const effect = state.source === "pick"
    ? `Your call on ${stateName} overrides its counties.`
    : state.winner === "T"
      ? `${stateName} is now exactly even.`
      : `${stateName} is now ${formatMargin(state.margin)}: ${decides}.`;

  return (
    <section className="sim-card" aria-labelledby="sim-county-heading">
      <button type="button" className="sim-back" onClick={onClose}><ArrowLeft aria-hidden="true" />{stateName}</button>
      <div>
        <h2 id="sim-county-heading">{name}, {state.code}</h2>
        <p className="sim-note">{edited ? "Set by you" : "Baseline plus swing"}</p>
      </div>
      <dl className="sim-facts">
        <div><dt>{base} result</dt><dd data-party={baseMargin > 0 ? "D" : "R"}>{formatMargin(baseMargin)}</dd></div>
        <div><dt>Simulated</dt><dd data-party={margin > 0 ? "D" : margin < 0 ? "R" : "T"}>{formatMargin(margin)}</dd></div>
      </dl>
      <div className="sim-field">
        <span id="sim-county-margin">Margin</span>
        <div className="sim-swing-row">
          <span className="sim-swing-end" data-party="R" aria-hidden="true">R</span>
          <Slider
            aria-labelledby="sim-county-margin"
            aria-valuetext={formatMargin(margin)}
            min={-LIMIT}
            max={LIMIT}
            step={0.5}
            value={[margin]}
            onValueChange={([value]) => set(value)}
          />
          <span className="sim-swing-end" data-party="D" aria-hidden="true">D</span>
        </div>
      </div>
      <div className="sim-seg" role="group" aria-label="Quick settings">
        <button type="button" onClick={() => set(-margin)}>Flip</button>
        <button type="button" data-party="D" onClick={() => set(margin + 5)}>5 pts to D</button>
        <button type="button" data-party="R" onClick={() => set(margin - 5)}>5 pts to R</button>
        <button type="button" disabled={!edited} onClick={() => onSet(null)}>Reset</button>
      </div>
      <p className="sim-effect" role="status">{effect}</p>
      {state.source === "pick" && (
        <button type="button" className="sim-button" onClick={onClearPick}>Use county results for {stateName}</button>
      )}
    </section>
  );
}
