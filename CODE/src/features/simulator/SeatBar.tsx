import type { Outcome } from "./model";

/**
 * Democratic, tossup, and Republican seats (or electoral votes) on one bar, with the line a party
 * needs marked. `headline` is the sentence in the middle; the caller knows its chamber's rules.
 */
export function SeatBar({ label, unit, totals, total, toWin, toWinLabel, headline, loading }: {
  /** Accessible name, e.g. "Electoral votes" or "U.S. Senate". */
  label: string;
  /** What is counted, for screen readers: "electoral votes", "seats". */
  unit: string;
  totals: Record<Outcome, number>;
  total: number;
  toWin: number;
  /** Text under the mark, e.g. "270 to win". */
  toWinLabel: string;
  headline: string;
  loading: boolean;
}) {
  const width = (value: number) => `${(value / total) * 100}%`;

  return (
    <section className="sim-ev" aria-label={label}>
      <div className="sim-ev-head">
        <div className="sim-ev-side" data-party="D">
          <strong>{loading ? "–" : totals.D}</strong>
          <span>Democrats</span>
        </div>
        <p className="sim-ev-headline" role="status">{loading ? "Loading results…" : headline}</p>
        <div className="sim-ev-side" data-party="R">
          <strong>{loading ? "–" : totals.R}</strong>
          <span>Republicans</span>
        </div>
      </div>
      <div
        className="sim-ev-bar"
        role="img"
        aria-label={`${totals.D} Democratic, ${totals.T} undecided, ${totals.R} Republican ${unit}; ${toWinLabel}`}
      >
        <span data-party="D" style={{ width: width(loading ? 0 : totals.D) }} />
        <span data-party="T" style={{ width: width(loading ? total : totals.T) }} />
        <span data-party="R" style={{ width: width(loading ? 0 : totals.R) }} />
        <i className="sim-ev-mark" style={{ left: width(toWin) }} aria-hidden="true" />
      </div>
      <div className="sim-ev-scale" aria-hidden="true">
        <span>0</span>
        <span style={{ left: width(toWin) }}>{toWinLabel}</span>
        <span>{total}</span>
      </div>
    </section>
  );
}
