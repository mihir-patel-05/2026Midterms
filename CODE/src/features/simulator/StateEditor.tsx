import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ELECTORAL_VOTES } from "./electoralVotes";
import { outcomeWords, ratingLabels, sourceLabels, STATE_NAMES } from "./labels";
import { formatMargin, marginPick, parseMarginInput, type Pick, type Rating, type StateOutcome } from "./model";
import { PICK_MARGIN_LIMIT } from "./useSimulatorParams";

const RATINGS: Rating[] = ["safe", "likely", "lean"];

/** One state: its baseline and simulated margin, and a pick that overrides them. */
export function StateEditor({ state, pick, base, summary, backLabel = "All states", onPick, onClose, children }: {
  state: StateOutcome;
  pick: Pick | undefined;
  base: number | null;
  /** Line under the name; defaults to the state's electoral votes and who wins them. */
  summary?: string;
  backLabel?: string;
  /** null clears the pick, returning the state to its computed result. */
  onPick: (pick: Pick | null) => void;
  onClose: () => void;
  /** Further sections: state swing and edited counties, Maine and Nebraska's districts. */
  children?: ReactNode;
}) {
  const name = STATE_NAMES[state.code] ?? state.code;
  const party = pick?.party ?? null;
  const rating = pick && pick.party !== "T" ? pick.rating : "lean";
  const pickMargin = pick && pick.party !== "T" ? pick.margin : undefined;
  const computed = state.margin === null ? "Tossup" : formatMargin(state.margin);

  // The typed margin follows the pick when a map click or a rating replaces it.
  const [draft, setDraft] = useState(pickMargin === undefined ? "" : formatMargin(pickMargin));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(pickMargin === undefined ? "" : formatMargin(pickMargin));
    setInvalid(false);
  }, [pickMargin]);

  const submitMargin = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      // Clearing the margin keeps the call and its rating.
      if (pick && pick.party !== "T" && pickMargin !== undefined) onPick({ party: pick.party, rating: pick.rating });
      return;
    }
    const margin = parseMarginInput(draft, PICK_MARGIN_LIMIT);
    setInvalid(margin === null);
    if (margin !== null) onPick(marginPick(margin));
  };

  return (
    <section className="sim-card" aria-labelledby="sim-state-heading">
      <button type="button" className="sim-back" onClick={onClose}><ArrowLeft aria-hidden="true" />{backLabel}</button>
      <div className="sim-identity">
        <span className="sim-monogram" data-party={state.winner}>{state.code}</span>
        <div>
          <h2 id="sim-state-heading">{name}</h2>
          <p>{summary ?? `${ELECTORAL_VOTES[state.code]} electoral votes · ${state.winner === "T" ? "Tossup" : `${outcomeWords[state.winner]} win`} (${sourceLabels[state.source]})`}</p>
        </div>
      </div>

      <dl className="sim-facts">
        {base !== null && <div><dt>{base} result</dt><dd>{formatMargin(state.baseMargin)}</dd></div>}
        <div><dt>Simulated</dt><dd data-party={state.margin === null ? "T" : state.margin > 0 ? "D" : "R"}>{computed}</dd></div>
        {pickMargin !== undefined && <div><dt>Your margin</dt><dd data-party={pickMargin > 0 ? "D" : "R"}>{formatMargin(pickMargin)}</dd></div>}
      </dl>

      <div className="sim-field">
        <span id="sim-pick-label">Your call</span>
        <div className="sim-seg" role="group" aria-labelledby="sim-pick-label">
          <button type="button" aria-pressed={party === null} onClick={() => onPick(null)}>{base === null ? "Not set" : "Computed"}</button>
          <button type="button" data-party="D" aria-pressed={party === "D"} onClick={() => onPick({ party: "D", rating })}>D</button>
          <button type="button" data-party="T" aria-pressed={party === "T"} onClick={() => onPick({ party: "T" })}>Tossup</button>
          <button type="button" data-party="R" aria-pressed={party === "R"} onClick={() => onPick({ party: "R", rating })}>R</button>
        </div>
      </div>
      {pick && pick.party !== "T" && (
        <div className="sim-field">
          <span id="sim-rating-label">Rating</span>
          <div className="sim-seg" role="group" aria-labelledby="sim-rating-label">
            {RATINGS.map((item) => (
              <button key={item} type="button" aria-pressed={pick.rating === item} onClick={() => onPick({ party: pick.party, rating: item })}>{ratingLabels[item]}</button>
            ))}
          </div>
        </div>
      )}
      <form className="sim-field" onSubmit={submitMargin}>
        <label htmlFor="sim-margin-input">Winning margin</label>
        <div className="sim-margin-row">
          <input
            id="sim-margin-input"
            className="sim-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. D+2.5 or R+4"
            value={draft}
            aria-invalid={invalid || undefined}
            aria-describedby="sim-margin-hint"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="sim-button">Set</button>
        </div>
        <small id="sim-margin-hint" className={invalid ? "sim-hint sim-hint-error" : "sim-hint"} role={invalid ? "alert" : undefined}>
          {invalid
            ? `Type a margin such as D+2.5 or R+4, above 0 and up to ${PICK_MARGIN_LIMIT}. Use Tossup for an even race.`
            : "Sets the exact result; its rating (Lean under 5, Likely 5–10, Safe 10+) sets the map shade. Clear it to keep just the rating."}
        </small>
      </form>
      {pick && state.margin !== null && (
        <p className="sim-note">Your call overrides the simulated {computed}.</p>
      )}
      {children}
    </section>
  );
}
