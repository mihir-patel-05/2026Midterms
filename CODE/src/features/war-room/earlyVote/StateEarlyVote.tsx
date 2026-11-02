import { useState } from "react";
import { numberFormat } from "@/features/election-monitor/constants";
import { StatusLine } from "../panels/Panel";
import { STATE_NAMES } from "../raceCodes";
import { CATEGORY_SHORT, dayLabel, EARLY_VOTE_CATEGORIES, gapLabel, otherMayIncludeUnaffiliated, partySplit, pct, useStateEarlyVote, type EarlyVoteCategory, type PartySplit, type Tally } from "./earlyVote";

const PARTS = [
  { key: "dem", label: "Dem", color: "var(--wr-dem)" },
  { key: "rep", label: "Rep", color: "var(--wr-rep)" },
  { key: "npa", label: "No party", color: "var(--wr-neutral)" },
  { key: "other", label: "Other", color: "var(--wr-ind)" },
] as const;

/**
 * Party registration as one stacked bar with a legend, or the reason there isn't one. Never a 0–0 split, and a label
 * civicAPI lists nothing under is left out rather than shown as 0%.
 */
export function PartyBar({ tally, place }: { tally: Tally; place: string }) {
  const split = partySplit(tally);
  if (!split) return <p className="wr-ev-noparty">{place} publishes no party registration for these ballots: total only.</p>;
  return (
    <div className="wr-ev-split">
      <div className="wr-ev-bar" role="img" aria-label={PARTS.map((part) => `${part.label} ${pct(split.shares[part.key])}`).join(", ")}>
        {PARTS.map((part) => split.shares[part.key] > 0 && <span key={part.key} style={{ flexGrow: split.shares[part.key], background: part.color }} />)}
      </div>
      <ul className="wr-ev-legend">
        {PARTS.filter((part) => part.key === "dem" || part.key === "rep" || tally.parties[part.key] > 0).map((part) => (
          <li key={part.key}>
            <i style={{ background: part.color }} aria-hidden="true" />
            <span>{part.key === "other" && otherMayIncludeUnaffiliated(tally) ? "Other, may include unaffiliated" : part.label}</span>
            <strong>{pct(split.shares[part.key])}</strong>
            <span className="wr-dim">{numberFormat.format(tally.parties[part.key])}</span>
          </li>
        ))}
        <li data-gap><span>Registration gap</span><strong>{gapLabel(split.gap)}</strong></li>
      </ul>
      {split.unknown > 0 && <p className="wr-ev-noparty">Party not published for {numberFormat.format(split.unknown)} ballots; shares cover the {numberFormat.format(split.known)} that have one.</p>}
    </div>
  );
}

function shareCell(split: PartySplit | null, key: "dem" | "rep") {
  return split ? pct(split.shares[key]) : "—";
}

const COUNTY_ROWS = 12;

/**
 * One state's early vote: each category civicAPI lists it under (total, its own date, the party registration
 * split) and the counties for the one picked. Used by the tracker screen and the map's Early vote tab.
 */
export function StateEarlyVote({ state }: { state: string }) {
  const query = useStateEarlyVote(state);
  const [picked, setPicked] = useState<EarlyVoteCategory | null>(null);
  const [all, setAll] = useState(false);
  const name = STATE_NAMES[state] ?? state;
  if (query.isLoading) return <StatusLine>Loading early vote for {name}…</StatusLine>;
  if (query.isError && !query.data) return <StatusLine tone="warn">Early vote is unavailable right now.</StatusLine>;
  const data = query.data;
  if (!data) return <StatusLine>Early vote is turned off.</StatusLine>;
  const categories = EARLY_VOTE_CATEGORIES.filter((category) => data.categories[category]);
  if (categories.length === 0) return <StatusLine>civicAPI has no early vote figures for {name}.</StatusLine>;
  const category = picked && data.categories[picked] ? picked : categories[0];
  const detail = data.categories[category]!;
  const counties = all ? detail.counties : detail.counties.slice(0, COUNTY_ROWS);

  return (
    <div className="wr-ev-state">
      <div className="wr-ev-cards">
        {categories.map((key) => {
          const view = data.categories[key]!;
          return (
            <section key={key} className="wr-ev-card" aria-label={`${name}: ${view.label}`}>
              <header>
                <h3>{view.label}</h3>
                <span className="wr-dim">{view.asOf ? `As of ${dayLabel(view.asOf)}` : "Date pending"}</span>
              </header>
              <strong className="wr-ev-total">{numberFormat.format(view.total)}</strong>
              <PartyBar tally={view} place={name} />
            </section>
          );
        })}
      </div>
      <div className="wr-ev-counties">
        <div className="wr-ev-counties-head">
          <h3>Counties · {CATEGORY_SHORT[category]}</h3>
          {categories.length > 1 && (
            <div className="wr-seg" role="group" aria-label="County figures for">
              {categories.map((key) => <button key={key} type="button" aria-pressed={key === category} onClick={() => setPicked(key)}>{CATEGORY_SHORT[key]}</button>)}
            </div>
          )}
        </div>
        {detail.counties.length === 0 ? <StatusLine>County detail is unavailable right now; the state total above is current.</StatusLine> : (
          <div className="wr-table-wrap">
            <table className="wr-table">
              <thead><tr><th scope="col">County</th><th scope="col" className="wr-num">Ballots</th><th scope="col" className="wr-num">Dem</th><th scope="col" className="wr-num">Rep</th><th scope="col" className="wr-num">Gap</th></tr></thead>
              <tbody>
                {counties.map((county) => {
                  const split = partySplit(county);
                  return (
                    <tr key={county.name}>
                      <th scope="row">{county.name}</th>
                      <td className="wr-num">{numberFormat.format(county.total)}</td>
                      <td className="wr-num">{shareCell(split, "dem")}</td>
                      <td className="wr-num">{shareCell(split, "rep")}</td>
                      <td className="wr-num">{split ? gapLabel(split.gap) : <span className="wr-dim">Total only</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {detail.counties.length > COUNTY_ROWS && (
              <button type="button" className="wr-btn wr-board-more" onClick={() => setAll(!all)}>{all ? `Show the largest ${COUNTY_ROWS}` : `Show all ${detail.counties.length}`}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
