import { ArrowLeft } from "lucide-react";
import { isRedistricted } from "@/features/election-monitor/map/redistricting";
import { STATE_NAMES } from "../labels";
import { formatMargin, type Outcome } from "../model";
import type { HouseResult, SeatOutcome } from "./model";
import { districtName, HOUSE_APPORTIONMENT } from "./races2026";
import type { HouseBase } from "./useMidtermParams";

const OPTIONS: Array<{ value: Outcome; label: string }> = [
  { value: "D", label: "D" },
  { value: "T", label: "Tossup" },
  { value: "R", label: "R" },
];
/** How many of the closest 2024 seats the overview lists. */
const CLOSEST = 25;

function baselineText(seat: SeatOutcome, base: HouseBase) {
  if (base === null || seat.baseWinner === null) return "no baseline";
  if (seat.unopposed) return `${seat.baseWinner} unopposed in ${base}`;
  return `${formatMargin(seat.baseMargin)} in ${base}`;
}

/** One district with Auto, D, Tossup, and R; Auto returns it to its baseline. */
function SeatRow({ seat, pick, base, focused, onPick }: {
  seat: SeatOutcome;
  pick: Outcome | undefined;
  base: HouseBase;
  focused: boolean;
  onPick: (code: string, winner: Outcome | null) => void;
}) {
  const flipped = seat.baseWinner !== null && seat.baseWinner !== "T" && seat.winner !== "T" && seat.winner !== seat.baseWinner;
  return (
    <div className="sim-district" aria-current={focused || undefined}>
      <div>
        <strong>
          <i className="sim-dot" data-party={seat.winner} aria-hidden="true" />
          {districtName(seat.code)}
          {flipped && <span className="sim-flag">Flip</span>}
        </strong>
        <small>{pick ? `your pick · ${baselineText(seat, base)}` : baselineText(seat, base)}</small>
      </div>
      <div className="sim-seg" role="group" aria-label={`${districtName(seat.code)} winner`}>
        <button type="button" aria-pressed={!pick} title={base === null ? "Auto: tossup" : `Auto: as in ${base}`} onClick={() => onPick(seat.code, null)}>Auto</button>
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" data-party={option.value} aria-pressed={pick === option.value} onClick={() => onPick(seat.code, option.value)}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

const count = (seats: SeatOutcome[]) => seats.reduce((totals, seat) => ({ ...totals, [seat.winner]: totals[seat.winner] + 1 }), { D: 0, R: 0, T: 0 } as Record<Outcome, number>);
const tally = (totals: Record<Outcome, number>) => `${totals.D} D · ${totals.R} R${totals.T ? ` · ${totals.T} tossup` : ""}`;

/**
 * The House side panel: a state's districts when one is selected; otherwise the district last
 * clicked, the seats changed so far, the closest 2024 seats, and every state.
 */
export function HousePanel({ result, picks, base, state, district, onPick, onSelectState }: {
  result: HouseResult;
  picks: Record<string, Outcome>;
  base: HouseBase;
  state: string | null;
  district: string | null;
  /** null returns the seat to its baseline. */
  onPick: (code: string, winner: Outcome | null) => void;
  onSelectState: (code: string | null) => void;
}) {
  const seats = Object.values(result.districts);
  const row = (seat: SeatOutcome) => <SeatRow key={seat.code} seat={seat} pick={picks[seat.code]} base={base} focused={seat.code === district} onPick={onPick} />;

  if (state && HOUSE_APPORTIONMENT[state]) {
    const own = seats.filter((seat) => seat.code.startsWith(`${state}-`));
    return (
      <section className="sim-card" aria-labelledby="sim-house-state-heading">
        <button type="button" className="sim-back" onClick={() => onSelectState(null)}><ArrowLeft aria-hidden="true" />All states</button>
        <div className="sim-card-head">
          <h2 id="sim-house-state-heading">{STATE_NAMES[state] ?? state}</h2>
          <span>{tally(count(own))}</span>
        </div>
        {isRedistricted(state) && (
          <p className="sim-note">{STATE_NAMES[state]} drew a new House map for 2026. These are the 2024 districts and winners, so treat them as approximate.</p>
        )}
        <div className="sim-districts">{own.map(row)}</div>
      </section>
    );
  }

  const changed = seats.filter((seat) => seat.source === "pick");
  const focused = district ? result.districts[district] : null;
  const closest = base === null
    ? []
    : seats.filter((seat) => seat.baseMargin !== null).sort((a, b) => Math.abs(a.baseMargin!) - Math.abs(b.baseMargin!)).slice(0, CLOSEST);
  const byState = Object.keys(HOUSE_APPORTIONMENT).map((code) => [code, count(seats.filter((seat) => seat.code.startsWith(`${code}-`)))] as const);

  return (
    <>
      {focused && (
        <section className="sim-card" aria-labelledby="sim-focus-heading">
          <div className="sim-card-head">
            <h2 id="sim-focus-heading">Last clicked</h2>
            <button type="button" className="sim-link" onClick={() => onSelectState(focused.code.slice(0, 2))}>All of {STATE_NAMES[focused.code.slice(0, 2)]}</button>
          </div>
          <div className="sim-districts">{row(focused)}</div>
        </section>
      )}
      <section className="sim-card" aria-labelledby="sim-changed-heading">
        <div className="sim-card-head">
          <h2 id="sim-changed-heading">Seats you set</h2>
          <span>{changed.length}</span>
        </div>
        {changed.length === 0
          ? <p className="sim-note">None yet. Click a district on the map to flip it, or pick a state below.</p>
          : <div className="sim-districts">{changed.map(row)}</div>}
      </section>
      {closest.length > 0 && (
        <section className="sim-card" aria-labelledby="sim-closest-heading">
          <div className="sim-card-head">
            <h2 id="sim-closest-heading">Closest seats in {base}</h2>
            <span>{CLOSEST} narrowest margins</span>
          </div>
          <div className="sim-districts">{closest.map(row)}</div>
        </section>
      )}
      <section className="sim-card" aria-labelledby="sim-house-states-heading">
        <div className="sim-card-head">
          <h2 id="sim-house-states-heading">States</h2>
          <span>Select one to set its districts</span>
        </div>
        <table className="sim-table">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">Seats</th>
              <th scope="col">D</th>
              <th scope="col">R</th>
            </tr>
          </thead>
          <tbody>
            {byState.map(([code, totals]) => (
              <tr key={code}>
                <th scope="row">
                  <button type="button" onClick={() => onSelectState(code)}>{STATE_NAMES[code] ?? code}</button>
                  {isRedistricted(code) && <span className="sim-tag" title="New House map for 2026">New map</span>}
                </th>
                <td>{HOUSE_APPORTIONMENT[code]}</td>
                <td><span className="sim-result" data-party="D">{totals.D}</span></td>
                <td><span className="sim-result" data-party="R">{totals.R}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
