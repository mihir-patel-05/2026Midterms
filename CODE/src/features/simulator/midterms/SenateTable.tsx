import { resultLabel, sourceLabels, STATE_NAMES } from "../labels";
import type { SenateResult } from "./model";
import { SENATE_INDEPENDENTS_NOTE, SENATE_NOT_UP, SENATE_RACES_2026 } from "./races2026";

/** The 35 races, closest first, with who holds each seat and whether the simulation flips it. */
export function SenateTable({ result, onSelect }: { result: SenateResult; onSelect: (code: string) => void }) {
  const rows = Object.values(result.states).sort((a, b) => Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0) || a.code.localeCompare(b.code));
  return (
    <section className="sim-card" aria-labelledby="sim-races-heading">
      <div className="sim-card-head">
        <h2 id="sim-races-heading">2026 Senate races, closest first</h2>
        <span>Select one to edit it</span>
      </div>
      <table className="sim-table">
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">Held</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((state) => {
            const race = SENATE_RACES_2026[state.code];
            const flipped = state.winner !== "T" && state.winner !== race.holder;
            return (
              <tr key={state.code}>
                <th scope="row">
                  <button type="button" onClick={() => onSelect(state.code)}>
                    <i className="sim-dot" data-party={state.winner} aria-hidden="true" />
                    {STATE_NAMES[state.code] ?? state.code}
                  </button>
                  {race.open && <span className="sim-tag">Open</span>}
                  {race.special && <span className="sim-tag">Special</span>}
                </th>
                <td><span className="sim-result" data-party={race.holder}>{race.holder}</span></td>
                <td>
                  <span className="sim-result" data-party={state.winner}>
                    {resultLabel(state)}
                  </span>
                  {flipped && <span className="sim-flag">Flip</span>}
                  {(state.source === "pick" || state.source === "counties") && <small>{sourceLabels[state.source]}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sim-note">
        Not up in 2026: {SENATE_NOT_UP.D} Democratic and {SENATE_NOT_UP.R} Republican seats. {SENATE_INDEPENDENTS_NOTE}
      </p>
    </section>
  );
}
