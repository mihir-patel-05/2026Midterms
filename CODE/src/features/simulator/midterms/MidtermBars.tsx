import { outcomeWords } from "../labels";
import type { Outcome } from "../model";
import { SeatBar } from "../SeatBar";
import { senateControl } from "./model";
import { HOUSE_SEATS, HOUSE_TO_CONTROL, SENATE_INDEPENDENTS_NOTE, SENATE_SEATS, SENATE_TO_CONTROL, VICE_PRESIDENT } from "./races2026";

const undecided = (totals: Record<Outcome, number>) => (totals.T ? ` · ${totals.T} undecided` : "");

function senateHeadline(totals: Record<Outcome, number>) {
  const control = senateControl(totals);
  if (control && totals[control] < SENATE_TO_CONTROL) return `50–50: ${outcomeWords[control]} control with ${VICE_PRESIDENT.name}'s tiebreak`;
  if (control) return `${outcomeWords[control]} control with ${totals[control]}`;
  return `Neither side has ${SENATE_TO_CONTROL}${undecided(totals)}`;
}

function houseHeadline(totals: Record<Outcome, number>) {
  const control = totals.D >= HOUSE_TO_CONTROL ? "D" : totals.R >= HOUSE_TO_CONTROL ? "R" : null;
  return control ? `${outcomeWords[control]} win the House with ${totals[control]}` : `Neither side has ${HOUSE_TO_CONTROL}${undecided(totals)}`;
}

/** Seats in both chambers, always both on screen whichever one is being edited. */
export function MidtermBars({ senate, house, senateLoading, houseLoading }: {
  senate: Record<Outcome, number>;
  house: Record<Outcome, number>;
  senateLoading: boolean;
  houseLoading: boolean;
}) {
  return (
    <div className="sim-bars">
      <div>
        <h2 className="sim-bar-title">U.S. Senate</h2>
        <SeatBar
          label="U.S. Senate seats"
          unit="Senate seats"
          totals={senate}
          total={SENATE_SEATS}
          toWin={SENATE_TO_CONTROL}
          toWinLabel={`${SENATE_TO_CONTROL} for control`}
          headline={senateHeadline(senate)}
          loading={senateLoading}
        />
        <p className="sim-hint">Includes seats not up in 2026. {SENATE_INDEPENDENTS_NOTE} At 50–50 the vice president ({VICE_PRESIDENT.name}, {VICE_PRESIDENT.party}) breaks ties.</p>
      </div>
      <div>
        <h2 className="sim-bar-title">U.S. House</h2>
        <SeatBar
          label="U.S. House seats"
          unit="House seats"
          totals={house}
          total={HOUSE_SEATS}
          toWin={HOUSE_TO_CONTROL}
          toWinLabel={`${HOUSE_TO_CONTROL} for control`}
          headline={houseHeadline(house)}
          loading={houseLoading}
        />
        <p className="sim-hint">All 435 seats are up every two years.</p>
      </div>
    </div>
  );
}
