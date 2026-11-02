import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatEtTime, numberFormat } from "@/features/election-monitor/constants";
import { earlyVoteEnabled } from "@/lib/featureFlags";
import { NotConnectedPanel } from "../panels/NotConnectedPanel";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { STATE_NAMES } from "../raceCodes";
import { useNow } from "../useNow";
import {
  CATEGORY_SHORT,
  categoryRows,
  changedStates,
  dayLabel,
  EARLY_VOTE_CATEGORIES,
  gapLabel,
  otherMayIncludeUnaffiliated,
  shareCell,
  useEarlyVote,
  type EarlyVoteCategory,
  type EarlyVoteNational,
  type EarlyVoteSort,
} from "./earlyVote";
import { PartyBar, StateEarlyVote } from "./StateEarlyVote";

const SORTS: Array<{ id: EarlyVoteSort; label: string }> = [
  { id: "total", label: "Most ballots" },
  { id: "gap", label: "Widest registration gap" },
  { id: "name", label: "State A–Z" },
];
/** How long a row that just changed stays highlighted. */
const FLASH_MS = 6_000;

const readCategory = (value: string | null): EarlyVoteCategory => (EARLY_VOTE_CATEGORIES as readonly string[]).includes(value ?? "") ? value as EarlyVoteCategory : "returned";
const readSort = (value: string | null): EarlyVoteSort => SORTS.some((sort) => sort.id === value) ? value as EarlyVoteSort : "total";

/** Rows whose numbers changed in the latest refresh, for a few seconds after it arrives. */
function useFlashes(data: EarlyVoteNational | null | undefined, category: EarlyVoteCategory) {
  const previous = useRef<EarlyVoteNational | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!data) return;
    const changed = changedStates(previous.current, data, category);
    previous.current = data;
    if (changed.size === 0) return;
    setFlashing(changed);
    const id = window.setTimeout(() => setFlashing(new Set()), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [data, category]);
  return flashing;
}

/** "checked 40 s ago", ticking on its own so the table doesn't re-render every second. */
function CheckedAgo({ checkedAt, refreshSeconds }: { checkedAt: string; refreshSeconds: number }) {
  const now = useNow(5_000);
  const seconds = Math.max(0, Math.round((now - Date.parse(checkedAt)) / 1000));
  const ago = seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
  return <span>civicAPI checked {ago} · every {Math.round(refreshSeconds / 60)} min while anyone is watching</span>;
}

/**
 * The early vote tracker (PLAN.md §4.1) at /war-room/early-vote: ballots requested, mail ballots returned, and
 * in-person early votes from civicAPI, nationally and by state, with each state's own date and a county
 * breakdown for the state picked. It refreshes itself every minute.
 */
export function EarlyVoteScreen() {
  const [search, setSearch] = useSearchParams();
  const category = readCategory(search.get("ev"));
  const sort = readSort(search.get("evsort"));
  const state = search.get("state")?.toUpperCase() ?? null;
  const selected = state && STATE_NAMES[state] ? state : null;
  const query = useEarlyVote();
  const flashing = useFlashes(query.data, category);
  const detailRef = useRef<HTMLDivElement>(null);

  const set = (key: string, value: string | null) => setSearch((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  const pickState = (code: string | null) => {
    set("state", code);
    if (code) window.setTimeout(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  };

  if (!earlyVoteEnabled) return <NotConnectedPanel title="Early vote" source="civicAPI" description="The early vote tracker is switched off in this build." />;

  const data = query.data;
  const summary = data?.categories[category];
  const rows = data ? categoryRows(data, category, sort, STATE_NAMES) : [];

  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Early vote // {CATEGORY_SHORT[category]}</div>
          <h1 className="wr-page-title">Early vote tracker</h1>
        </div>
        <div className="wr-head-actions">
          <div className="wr-seg" role="group" aria-label="Ballots">
            {EARLY_VOTE_CATEGORIES.map((key) => (
              <button key={key} type="button" aria-pressed={key === category} onClick={() => set("ev", key === "returned" ? null : key)}>
                {CATEGORY_SHORT[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isLoading ? <StatusLine>Loading early vote from civicAPI…</StatusLine>
        : !data ? (query.isError ? <StatusLine tone="warn">Early vote is unavailable right now. This page keeps trying every minute.</StatusLine> : <StatusLine>Early vote is turned off on the server.</StatusLine>)
        : !summary?.available ? <StatusLine tone="warn">civicAPI's {CATEGORY_SHORT[category].toLowerCase()} figures are unavailable right now.</StatusLine>
        : (
          <>
            <div className="wr-ev-live" role="status">
              <Badge tone="live">Live</Badge>
              <CheckedAgo checkedAt={data.checkedAt} refreshSeconds={data.refreshSeconds} />
              {data.changedAt && <span>· last change seen {formatEtTime(data.changedAt)} ET</span>}
              {query.isError && <span className="wr-ev-stale">· the latest check failed; showing the last good numbers</span>}
            </div>
            <dl className="wr-night-figures">
              <div><dt>{summary.label}</dt><dd>{numberFormat.format(summary.total.total)}</dd></div>
              <div><dt>States reporting</dt><dd>{summary.states}</dd></div>
              <div><dt>With party data</dt><dd>{summary.partyStates}<span> / {summary.states}</span></dd></div>
              <div><dt>State dates</dt><dd>{summary.asOfRange ? (summary.asOfRange.oldest === summary.asOfRange.newest ? dayLabel(summary.asOfRange.newest) : `${dayLabel(summary.asOfRange.oldest)}–${dayLabel(summary.asOfRange.newest)}`) : "Pending"}{summary.undated > 0 && <span> · {summary.undated} pending</span>}</dd></div>
            </dl>

            <div className="wr-grid-panels wr-ev-top" ref={detailRef}>
              <Panel title={`National · ${summary.label.toLowerCase()} by party registration`}
                footnote={`Covers the ${summary.partyStates} states that publish party registration; the other ${summary.states - summary.partyStates} report totals only, counted in the total above. Registration is not a vote.`}>
                <PartyBar tally={summary.total} place="No state" />
              </Panel>
              {selected ? (
                <Panel title={`${STATE_NAMES[selected]} · early vote`} brackets="top" meta={<button type="button" className="wr-btn" onClick={() => pickState(null)}>Clear</button>}>
                  <StateEarlyVote state={selected} />
                </Panel>
              ) : (
                <Panel title="State detail">
                  <p className="wr-dim">Pick a state in the table for its counties and every category it reports.</p>
                </Panel>
              )}
            </div>

            <Panel flush title={`By state · ${summary.label.toLowerCase()}`}
              meta={(
                <label className="wr-select">
                  <span className="wr-sr-only">Sort states</span>
                  <select value={sort} onChange={(event) => set("evsort", event.target.value === "total" ? null : event.target.value)}>
                    {SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              )}
              footnote="Each state publishes on its own schedule, so each row shows its own date · a state civicAPI doesn't list is left out, never shown as zero">
              <div className="wr-table-wrap">
                <table className="wr-table wr-ev-table">
                  <thead>
                    <tr>
                      <th scope="col">State</th>
                      <th scope="col" className="wr-num">Ballots</th>
                      <th scope="col" className="wr-num">Dem</th>
                      <th scope="col" className="wr-num">Rep</th>
                      <th scope="col" className="wr-num">No party</th>
                      <th scope="col" className="wr-num">Other</th>
                      <th scope="col" className="wr-num">Gap</th>
                      <th scope="col">As of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ state: code, name, view, split }) => (
                      <tr key={code} data-changed={flashing.has(code) || undefined} aria-selected={code === selected || undefined}>
                        <td><button type="button" className="wr-cell-btn" onClick={() => pickState(code)}>{name}</button></td>
                        <td className="wr-num">{numberFormat.format(view.total)}</td>
                        {split ? (
                          <>
                            <td className="wr-num">{shareCell(split, view, "dem")}</td>
                            <td className="wr-num">{shareCell(split, view, "rep")}</td>
                            <td className="wr-num" title={view.parties.npa ? undefined : "civicAPI lists no separate unaffiliated count for this state"}>{shareCell(split, view, "npa")}</td>
                            <td className="wr-num" title={otherMayIncludeUnaffiliated(view) ? "May include unaffiliated voters" : undefined}>{shareCell(split, view, "other")}{otherMayIncludeUnaffiliated(view) ? "†" : ""}</td>
                            <td className="wr-num" title={split.unknown > 0 ? `Party not published for ${numberFormat.format(split.unknown)} ballots` : undefined}>{gapLabel(split.gap)}{split.unknown > 0 ? "*" : ""}</td>
                          </>
                        ) : <td className="wr-num wr-dim" colSpan={5}>Total only · party not published</td>}
                        <td className={view.asOf ? undefined : "wr-dim"}>{view.asOf ? dayLabel(view.asOf) : "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <p className="wr-ev-source">
              Src: <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.attribution}</a>.
              Party is voter registration, not vote choice; independents and minor parties vote too, and early ballots are not results.
              * Party not published for some ballots in that state; shares cover those with one.
              — civicAPI lists nothing under that label for the state. † No separate unaffiliated count is listed, so Other may include unaffiliated voters.
            </p>
          </>
        )}
    </>
  );
}
