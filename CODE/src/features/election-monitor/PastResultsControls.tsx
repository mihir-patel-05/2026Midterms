import {
  BIN_COLORS, MARGIN_BREAKS, PAST_OFFICES, pastOfficeLabels, SHIFT_BREAKS, STATUS_COLORS,
  type PastMetric, type PastOffice,
} from "./pastResults";
import type { PastResultsView } from "./usePastResultsView";

export interface PastPatch {
  pastOffice?: PastOffice;
  pastYear?: number | null;
  pastMetric?: PastMetric;
  pastFrom?: number | null;
}

/** Office, year, and view pickers for Past results. Years come from the loaded files, so a missing year is never offered. */
export function PastResultsControls({ view, office, countyLevel, onChange, onLevelChange }: {
  view: PastResultsView;
  office: PastOffice;
  countyLevel: boolean;
  onChange: (patch: PastPatch) => void;
  onLevelChange: (counties: boolean) => void;
}) {
  const years = [...view.years].reverse();
  return (
    <div className="em-past-controls" role="group" aria-label="Past results options">
      <div className="em-seg" role="group" aria-label="Office">
        {PAST_OFFICES.map((item) => (
          <button key={item} type="button" aria-pressed={item === office} onClick={() => onChange({ pastOffice: item, pastYear: null, pastFrom: null })}>{pastOfficeLabels[item]}</button>
        ))}
      </div>
      <label className="em-past-select">
        <span>Year</span>
        <select value={view.year ?? ""} disabled={years.length === 0} onChange={(event) => onChange({ pastYear: Number(event.target.value), pastFrom: null })}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      {office === "president" && (
        <>
          <div className="em-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={view.metric === "winner"} onClick={() => onChange({ pastMetric: "winner" })}>Winner</button>
            <button type="button" aria-pressed={view.metric === "shift"} disabled={view.earlierYears.length === 0} onClick={() => onChange({ pastMetric: "shift" })}>Shift</button>
          </div>
          {view.metric === "shift" && (
            <label className="em-past-select">
              <span>From</span>
              <select value={view.from ?? ""} onChange={(event) => onChange({ pastFrom: Number(event.target.value) })}>
                {[...view.earlierYears].reverse().map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          )}
          <div className="em-seg" role="group" aria-label="Map by">
            <button type="button" aria-pressed={!countyLevel} onClick={() => onLevelChange(false)}>States</button>
            <button type="button" aria-pressed={countyLevel} onClick={() => onLevelChange(true)}>Counties</button>
          </div>
        </>
      )}
    </div>
  );
}

const marginLabels = ["<1", "1–5", "5–10", "10–20", "20+"];
const shiftLabels = ["0.5–2", "2–5", "5–10", "10+"];
// Keep the legend in step with the bin edges if they ever change.
if (MARGIN_BREAKS.length !== marginLabels.length - 1 || SHIFT_BREAKS.length !== shiftLabels.length) throw new Error("Legend labels are out of step with the bins");

export function Swatch({ color, label }: { color: string; label?: string }) {
  return <span className="em-past-swatch" style={{ background: color }} title={label} aria-hidden="true" />;
}

/**
 * Legend, method, and source for the Past results map. Same bins and wording for every party;
 * independents and third parties have their own colour.
 */
export function PastResultsLegend({ view, office }: { view: PastResultsView; office: PastOffice }) {
  const source = view.meta?.offices[office];
  const greys: Array<[string, string]> = [
    ...(office === "senate" ? [[STATUS_COLORS.no_race, "No Senate race that year"] as [string, string]] : []),
    ...(office !== "president" ? [[STATUS_COLORS.unopposed, "Unopposed: no vote count reported"] as [string, string]] : []),
    [STATUS_COLORS.not_reported, office === "president" && view.layer === "counties" ? "Not reported by county" : "Not reported"],
  ];
  return (
    <div className="em-past-legend">
      <p className="em-past-label"><strong>Past results (MIT Election Lab)</strong>, not 2026 results or predictions.</p>
      {view.metric === "shift" ? (
        <div className="em-past-scale" role="img" aria-label={`Change in margin from ${view.from} to ${view.year}. Republican side: ${shiftLabels.slice().reverse().join(", ")} points. Under 0.5 points: about the same. Democratic side: ${shiftLabels.join(", ")} points.`}>
          <span className="em-past-end">← Toward Republicans</span>
          {[3, 2, 1, 0].map((i) => <Swatch key={`r${i}`} color={BIN_COLORS[`SR${i}`]} label={`${shiftLabels[i]} pts toward Republicans`} />)}
          <Swatch color={STATUS_COLORS.no_shift} label="Under 0.5 pts" />
          {[0, 1, 2, 3].map((i) => <Swatch key={`d${i}`} color={BIN_COLORS[`SD${i}`]} label={`${shiftLabels[i]} pts toward Democrats`} />)}
          <span className="em-past-end">Toward Democrats →</span>
        </div>
      ) : (
        <table className="em-past-ramp">
          <caption className="sr-only">Winner and margin of victory, in points</caption>
          <thead><tr><th scope="col"><span className="sr-only">Winner</span></th>{marginLabels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {([["D", "Democrat"], ["R", "Republican"], ["O", "Ind./other"]] as const).map(([party, name]) => (
              <tr key={party}>
                <th scope="row">{name}</th>
                {marginLabels.map((label, i) => <td key={label}><Swatch color={BIN_COLORS[`${party}${i}`]} label={`${name} by ${label} pts`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul className="em-past-greys">
        {(view.metric === "shift" ? [[STATUS_COLORS.not_comparable, "Not comparable (boundaries or reporting changed)"] as [string, string]] : greys).map(([color, label]) => (
          <li key={label}><Swatch color={color} />{label}</li>
        ))}
      </ul>
      <details className="em-past-method">
        <summary>How this is calculated</summary>
        <ul>
          <li>Shares are of all votes cast for the office in that place, including third parties and write-ins. Over-, under-, and blank-vote lines are not counted.</li>
          <li>{view.metric === "shift"
            ? "Margin is the Democratic share minus the Republican share. Shift is the later year's margin minus the earlier year's, in points, computed only where the same county or state reported both years."
            : "Each place is coloured by the winner. The shade is the winner's share minus the runner-up's, in points, using the same bins for every party."}</li>
          {office !== "president" && <li>The map uses the race that decided the seat: the regular election, or its runoff when one was held. Specials and runoffs are listed in the Past results tab.</li>}
          {office === "senate" && <li>Maine and Alaska use ranked-choice voting; the file reports first-round votes.</li>}
          {office === "house" && <li>Districts are coloured only for 2024, the last election held on the lines the map draws. For other years, select a district to read its race.</li>}
          {office === "president" && view.layer === "counties" && <li>Alaska reports by state house district, not by borough, so its boroughs are grey. Kansas City, Missouri reports separately; its votes are added to Jackson County.</li>}
        </ul>
      </details>
      {source && (
        <p className="em-past-source">
          Source: <a href={source.doi} target="_blank" rel="noopener noreferrer">{source.attribution}</a>
        </p>
      )}
    </div>
  );
}
