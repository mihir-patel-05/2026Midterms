import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ELECTORAL_VOTES } from "./electoralVotes";
import { outcomeWords, ratingLabels, sourceLabels, STATE_NAMES } from "./labels";
import { formatMargin, type Pick, type Rating, type StateOutcome } from "./model";

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
  const computed = state.margin === null ? "Tossup" : formatMargin(state.margin);

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
      {pick && state.margin !== null && (
        <p className="sim-note">Your call overrides the simulated {computed}.</p>
      )}
      {children}
    </section>
  );
}
