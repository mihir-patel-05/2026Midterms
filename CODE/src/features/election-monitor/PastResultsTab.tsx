import type { CSSProperties } from "react";
import { districtLabel, numberFormat } from "./constants";
import { useCountyNames } from "./demographics";
import {
  BIN_COLORS, decisiveRace, describeResult, describeShift, formatPts, partyLabel, pastOfficeLabels, personName, presidentResult, raceResult, shiftResult,
  usePresidentSeries, type HouseYear, type PresidentYear, type Race, type SenateYear,
} from "./pastResults";
import type { PastResultsView } from "./usePastResultsView";

const share = (votes: number, total: number) => (total > 0 ? `${((votes / total) * 100).toFixed(1)}%` : "–");
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatPts(value)}`;
/** "D+4.2" / "R+1.7": the leading party and its lead over the other, in points. */
const leanLabel = (margin: number) => (margin === 0 ? "Even" : `${margin > 0 ? "D" : "R"}+${formatPts(margin)}`);

function raceTitle(race: Race) {
  const parts = [race.special ? "Special election" : "General election"];
  if (race.stage === "RUNOFF") parts.push(`runoff${race.heldIn ? ` (${race.heldIn})` : ""}`);
  return parts.join(", ");
}

function RaceTable({ race }: { race: Race }) {
  const total = race.candidates.reduce((sum, candidate) => sum + (candidate.votes ?? 0), 0);
  return (
    <div className="em-past-race">
      <h4>{raceTitle(race)}{race.unofficial ? " · unofficial" : ""}</h4>
      {race.firstRound && <p className="em-past-fine">Ranked-choice election: first-round votes.</p>}
      <table className="em-past-table">
        <thead><tr><th scope="col">Candidate</th><th scope="col">Party</th><th scope="col">Votes</th><th scope="col">Share</th></tr></thead>
        <tbody>
          {race.candidates.map((candidate, index) => (
            <tr key={candidate.name}>
              <th scope="row">{personName(candidate.name)}{index === 0 && race.candidates.length > 1 && <span className="em-past-won"> · won</span>}</th>
              <td title={candidate.partyDetailed}>{partyLabel(candidate)}</td>
              <td>{candidate.votes === null ? "–" : numberFormat.format(candidate.votes)}</td>
              <td>{candidate.votes === null ? "–" : share(candidate.votes, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {race.status === "unopposed" && <p className="em-past-fine">Unopposed. The state reported no vote count, so none is shown (not zero).</p>}
    </div>
  );
}

/** Seats won per party in a year, from the race that decided each seat. */
function seatTally(areas: Record<string, Race[]>) {
  const tally = { D: 0, R: 0, O: 0 };
  for (const races of Object.values(areas)) {
    const result = raceResult(decisiveRace(races));
    if (result.winner) tally[result.winner.party]++;
  }
  return tally;
}

/** Presidential margin, D share minus R share, for every year in the file. */
function MarginHistory({ series, years, title }: { series: Array<number | null> | undefined; years: number[]; title: string }) {
  if (!series) return null;
  const max = Math.max(10, ...series.map((value) => Math.abs(value ?? 0)));
  return (
    <div className="em-past-history">
      <h4>{title}</h4>
      <table className="em-past-table em-past-margins">
        <thead><tr><th scope="col">Year</th><th scope="col">Margin</th><th scope="col"><span className="sr-only">Bar</span></th></tr></thead>
        <tbody>
          {years.map((year, i) => {
            const value = series[i];
            return (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td>{value === null ? "Not reported" : leanLabel(value)}</td>
                <td aria-hidden="true">
                  {value !== null && (
                    <span className="em-past-bar" data-side={value >= 0 ? "d" : "r"}
                      style={{ "--w": `${(Math.abs(value) / max) * 50}%`, "--c": value >= 0 ? BIN_COLORS.D2 : BIN_COLORS.R2 } as CSSProperties} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="em-past-fine">Democratic share minus Republican share of all presidential votes, in points.</p>
    </div>
  );
}

function PresidentPanel({ view, stateCode, stateName, county }: { view: PastResultsView; stateCode: string | null; stateName: string | null; county: string | null }) {
  const data = view.data as PresidentYear;
  const series = usePresidentSeries(true);
  const countyNames = useCountyNames(county ? stateCode : null);
  const year = view.year!;
  const names = data.candidates;

  let votes: [number, number, number] | undefined;
  let place: string;
  if (county) {
    votes = data.counties[county];
    place = countyNames.get(county) ?? `County ${county}`;
  } else if (stateCode) {
    votes = data.states[stateCode]?.votes;
    place = stateName ?? stateCode;
  } else {
    votes = Object.values(data.states).reduce<[number, number, number]>((sum, s) => [sum[0] + s.votes[0], sum[1] + s.votes[1], sum[2] + s.votes[2]], [0, 0, 0]);
    place = "United States (popular vote)";
  }
  const result = presidentResult(votes, names);
  const others = !county && stateCode ? data.states[stateCode]?.others ?? [] : [];
  const note = !stateCode ? undefined : county ? view.meta?.countyNotes[stateCode] : view.meta?.stateNotes?.[`president|${year}|${stateCode}`];

  return (
    <>
      <section className="em-card">
        <h3>{place} · President {year}</h3>
        {note && <p className="em-past-fine">{note}</p>}
        {result.status !== "ok" || !votes ? <p className="em-past-fine">{county ? "No county result reported for this place." : "Not reported."}</p> : (
          <>
            <p className="em-past-headline">{describeResult(result, "president", year)[0]}</p>
            <table className="em-past-table">
              <thead><tr><th scope="col">Candidate</th><th scope="col">Party</th><th scope="col">Votes</th><th scope="col">Share</th></tr></thead>
              <tbody>
                <tr><th scope="row">{personName(names.D)}</th><td>D</td><td>{numberFormat.format(votes[0])}</td><td>{share(votes[0], result.total!)}</td></tr>
                <tr><th scope="row">{personName(names.R)}</th><td>R</td><td>{numberFormat.format(votes[1])}</td><td>{share(votes[1], result.total!)}</td></tr>
                {others.length > 0
                  ? others.map(([name, party, n]) => <tr key={name}><th scope="row">{name === "OTHER" ? "Other candidates" : personName(name)}</th><td>{name === "OTHER" ? "–" : personName(party)}</td><td>{numberFormat.format(n)}</td><td>{share(n, result.total!)}</td></tr>)
                  : <tr><th scope="row">All other candidates</th><td>–</td><td>{numberFormat.format(votes[2])}</td><td>{share(votes[2], result.total!)}</td></tr>}
              </tbody>
            </table>
            <p className="em-past-fine">Total {numberFormat.format(result.total!)} votes for president.</p>
          </>
        )}
      </section>
      {view.metric === "shift" && view.from !== null && <ShiftCard view={view} stateCode={stateCode} county={county} place={place} />}
      <section className="em-card">
        <MarginHistory
          title="Presidential margin by year"
          years={series.data?.years ?? []}
          series={!series.data ? undefined : county ? series.data.counties[county] : stateCode ? series.data.states[stateCode] : undefined}
        />
        {!stateCode && <p className="em-past-fine">Select a state or county for its margin history.</p>}
        {county && series.data && !series.data.counties[county] && <p className="em-past-fine">No margin history for this county.</p>}
        {series.isLoading && <p className="em-past-fine">Loading margin history…</p>}
      </section>
    </>
  );
}

function ShiftCard({ view, stateCode, county, place }: { view: PastResultsView; stateCode: string | null; county: string | null; place: string }) {
  const later = view.data as PresidentYear;
  const lookup = view.lookup;
  if (!lookup || (!county && !stateCode)) return null;
  const shift = lookup.shift(county ?? stateCode!, county ? "counties" : "states");
  if (!shift) return null;
  const rows: Array<[string, number | undefined]> = [["Democratic share", shift.demShift], ["Republican share", shift.repShift], ["Other share", shift.otherShift]];
  return (
    <section className="em-card">
      <h3>{place} · {view.from} → {later.year}</h3>
      <p className="em-past-headline">{describeShift(shift, view.from!, later.year)[0].replace(/^\d{4} → \d{4}: /, "")}</p>
      {shift.comparable && (
        <table className="em-past-table">
          <thead><tr><th scope="col">Measure</th><th scope="col">Change (points)</th></tr></thead>
          <tbody>
            {rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{signed(value!)}</td></tr>)}
            <tr><th scope="row">Margin (D minus R)</th><td>{signed(shift.marginShift!)}</td></tr>
            <tr><th scope="row">Total votes</th><td>{`${shift.turnoutChange! >= 0 ? "+" : "−"}${Math.abs(shift.turnoutChange!).toFixed(1)}%`}</td></tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function SenatePanel({ view, stateCode, stateName }: { view: PastResultsView; stateCode: string | null; stateName: string | null }) {
  const data = view.data as SenateYear;
  const year = view.year!;
  if (!stateCode) {
    const tally = seatTally(data.states);
    return (
      <section className="em-card">
        <h3>U.S. Senate {year}</h3>
        <p className="em-past-headline">{Object.keys(data.states).length} states held a Senate election.</p>
        <p className="em-past-fine">Seats won: Democrats {tally.D}, Republicans {tally.R}{tally.O ? `, independents or third parties ${tally.O}` : ""}. Select a state for its races.</p>
      </section>
    );
  }
  const races = data.states[stateCode];
  return (
    <section className="em-card">
      <h3>{stateName ?? stateCode} · U.S. Senate {year}</h3>
      {!races ? <p className="em-past-fine">No Senate race in {stateName ?? stateCode} in {year}. Senate seats are up every six years, so most states vote in two of every three cycles.</p>
        : races.map((race) => <RaceTable key={`${race.special}-${race.stage}`} race={race} />)}
    </section>
  );
}

function HousePanel({ view, stateCode, stateName, district }: { view: PastResultsView; stateCode: string | null; stateName: string | null; district: string | null }) {
  const data = view.data as HouseYear;
  const year = view.year!;
  const linesNote = !view.houseLinesMatch && (
    <p className="em-past-fine">District lines in {year} were different from the outlines on the map, so a district number may cover a different area than it does today.</p>
  );
  if (!stateCode) {
    const tally = seatTally(data.districts);
    return (
      <section className="em-card">
        <h3>U.S. House {year}</h3>
        <p className="em-past-headline">Seats won: Democrats {tally.D}, Republicans {tally.R}{tally.O ? `, independents or third parties ${tally.O}` : ""}.</p>
        {linesNote}
        <p className="em-past-fine">Select a state or district for its races.</p>
      </section>
    );
  }
  if (district) {
    const code = `${stateCode}-${district}`;
    const races = data.districts[code];
    return (
      <section className="em-card">
        <h3>{districtLabel(stateCode, district)} · U.S. House {year}</h3>
        {linesNote}
        {!races ? <p className="em-past-fine">No race on file for {districtLabel(stateCode, district)} in {year}.</p> : races.map((race) => <RaceTable key={`${race.special}-${race.stage}`} race={race} />)}
      </section>
    );
  }
  const districts = Object.entries(data.districts).filter(([code]) => code.startsWith(`${stateCode}-`));
  return (
    <section className="em-card">
      <h3>{stateName ?? stateCode} · U.S. House {year}</h3>
      {linesNote}
      <table className="em-past-table">
        <thead><tr><th scope="col">District</th><th scope="col">Winner</th><th scope="col">Result</th></tr></thead>
        <tbody>
          {districts.map(([code, races]) => {
            const result = raceResult(decisiveRace(races));
            const [state, number] = code.split("-");
            return (
              <tr key={code}>
                <th scope="row">{districtLabel(state, number)}</th>
                <td>{result.winner ? `${personName(result.winner.name)} (${result.winner.party === "O" ? "Ind." : result.winner.party})` : "–"}</td>
                <td>{result.status === "unopposed" ? "Unopposed" : result.margin !== undefined ? `+${formatPts(result.margin)}` : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="em-past-fine">Result is the winner's lead over the runner-up, in points.</p>
    </section>
  );
}

/** Detail panel tab for Past results: votes, shares, and history for the selected place. */
export function PastResultsTab({ view, stateCode, stateName, district, county }: {
  view: PastResultsView;
  stateCode: string | null;
  stateName: string | null;
  district: string | null;
  county: string | null;
}) {
  if (view.error) return <section className="em-card"><p className="em-past-fine">Past results could not be loaded.</p></section>;
  if (view.loading || !view.data || view.year === null) return <section className="em-card"><p className="em-past-fine" role="status">Loading past results…</p></section>;
  const office = view.data.office;
  const source = view.meta?.offices[office];
  return (
    <div className="em-past-tab">
      <p className="em-note" role="note">{pastOfficeLabels[office]} results from MIT Election Lab files. These are past elections, not 2026 results or predictions.</p>
      {office === "president" && <PresidentPanel view={view} stateCode={stateCode} stateName={stateName} county={county} />}
      {office === "senate" && <SenatePanel view={view} stateCode={stateCode} stateName={stateName} />}
      {office === "house" && <HousePanel view={view} stateCode={stateCode} stateName={stateName} district={district} />}
      {source && <p className="em-past-source">Source: <a href={source.doi} target="_blank" rel="noopener noreferrer">{source.attribution}</a></p>}
    </div>
  );
}
