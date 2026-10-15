import { TOTAL_ELECTORAL_VOTES, VOTES_TO_WIN } from "./electoralVotes";
import { outcomeWords } from "./labels";
import type { Outcome } from "./model";
import { SeatBar } from "./SeatBar";

/** Democratic, tossup, and Republican electoral votes on one bar, with the 270 line marked. */
export function EvBar({ totals, loading }: { totals: Record<Outcome, number>; loading: boolean }) {
  const winner = totals.D >= VOTES_TO_WIN ? "D" : totals.R >= VOTES_TO_WIN ? "R" : null;
  const tie = totals.D === TOTAL_ELECTORAL_VOTES / 2 && totals.R === TOTAL_ELECTORAL_VOTES / 2;
  const headline = winner
    ? `${outcomeWords[winner]} win with ${totals[winner]}`
    : tie
      ? "269–269: the House would decide"
      : `Neither side has ${VOTES_TO_WIN}${totals.T ? ` · ${totals.T} undecided` : ""}`;

  return (
    <SeatBar
      label="Electoral votes"
      unit="electoral votes"
      totals={totals}
      total={TOTAL_ELECTORAL_VOTES}
      toWin={VOTES_TO_WIN}
      toWinLabel={`${VOTES_TO_WIN} to win`}
      headline={headline}
      loading={loading}
    />
  );
}
