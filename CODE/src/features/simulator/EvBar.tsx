import { TOTAL_ELECTORAL_VOTES, VOTES_TO_WIN } from "./electoralVotes";
import { outcomeWords } from "./labels";
import type { Outcome } from "./model";

/** Democratic, tossup, and Republican electoral votes on one bar, with the 270 line marked. */
export function EvBar({ totals, loading }: { totals: Record<Outcome, number>; loading: boolean }) {
  const winner = totals.D >= VOTES_TO_WIN ? "D" : totals.R >= VOTES_TO_WIN ? "R" : null;
  const tie = totals.D === TOTAL_ELECTORAL_VOTES / 2 && totals.R === TOTAL_ELECTORAL_VOTES / 2;
  const headline = loading
    ? "Loading results…"
    : winner
      ? `${outcomeWords[winner]} win with ${totals[winner]}`
      : tie
        ? "269–269: the House would decide"
        : `Neither side has ${VOTES_TO_WIN}${totals.T ? ` · ${totals.T} undecided` : ""}`;
  const width = (value: number) => `${(value / TOTAL_ELECTORAL_VOTES) * 100}%`;

  return (
    <section className="sim-ev" aria-label="Electoral votes">
      <div className="sim-ev-head">
        <div className="sim-ev-side" data-party="D">
          <strong>{loading ? "–" : totals.D}</strong>
          <span>Democrats</span>
        </div>
        <p className="sim-ev-headline" role="status">{headline}</p>
        <div className="sim-ev-side" data-party="R">
          <strong>{loading ? "–" : totals.R}</strong>
          <span>Republicans</span>
        </div>
      </div>
      <div
        className="sim-ev-bar"
        role="img"
        aria-label={`${totals.D} Democratic, ${totals.T} undecided, ${totals.R} Republican electoral votes; ${VOTES_TO_WIN} to win`}
      >
        <span data-party="D" style={{ width: width(loading ? 0 : totals.D) }} />
        <span data-party="T" style={{ width: width(loading ? TOTAL_ELECTORAL_VOTES : totals.T) }} />
        <span data-party="R" style={{ width: width(loading ? 0 : totals.R) }} />
        <i className="sim-ev-mark" style={{ left: width(VOTES_TO_WIN) }} aria-hidden="true" />
      </div>
      <div className="sim-ev-scale" aria-hidden="true">
        <span>0</span>
        <span style={{ left: width(VOTES_TO_WIN) }}>{VOTES_TO_WIN} to win</span>
        <span>{TOTAL_ELECTORAL_VOTES}</span>
      </div>
    </section>
  );
}
