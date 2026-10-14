import { ELECTORAL_VOTES } from "./electoralVotes";
import { ratingLabels, sourceLabels, STATE_NAMES } from "./labels";
import { formatMargin, type SimulationResult, type StateOutcome } from "./model";

const baseWinner = (state: StateOutcome) => (state.baseMargin === null ? null : state.baseMargin > 0 ? "D" : "R");

/**
 * Every state, closest first, with what moved it. Picks and tossups sort by their computed margin
 * so the list stays put while you click through a state.
 */
export function StateTable({ result, base, onSelect }: {
  result: SimulationResult;
  base: number | null;
  onSelect: (code: string) => void;
}) {
  const rows = Object.values(result.states).sort((a, b) => Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0) || a.code.localeCompare(b.code));
  return (
    <section className="sim-card" aria-labelledby="sim-states-heading">
      <div className="sim-card-head">
        <h2 id="sim-states-heading">States, closest first</h2>
        <span>Select one to edit it</span>
      </div>
      <table className="sim-table">
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">EV</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((state) => {
            const flipped = base !== null && state.winner !== "T" && baseWinner(state) !== null && state.winner !== baseWinner(state);
            return (
              <tr key={state.code}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect(state.code)}>
                    <i className="sim-dot" data-party={state.winner} aria-hidden="true" />
                    {STATE_NAMES[state.code] ?? state.code}
                  </button>
                </th>
                {/* Full count; Maine's and Nebraska's district votes are split out in the totals. */}
                <td>{ELECTORAL_VOTES[state.code]}</td>
                <td>
                  <span className="sim-result" data-party={state.winner}>
                    {state.winner === "T" && state.source !== "baseline" ? "Tossup" : state.source === "pick" ? `${ratingLabels[state.rating!]} ${state.winner}` : formatMargin(state.margin)}
                  </span>
                  {flipped && <span className="sim-flag">Flip</span>}
                  {(state.source === "pick" || state.source === "counties") && <small>{sourceLabels[state.source]}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
