import { useState, type KeyboardEvent } from "react";
import { historyByTicker, useMarketHistory } from "@/features/election-monitor/marketHistory";
import { SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import { Icon } from "../icons";
import { Panel } from "../panels/Panel";
import { partyColor, partyLetter } from "../party";
import { WATCH_DAYS } from "../queries";
import { raceLabel, raceState } from "../raceCodes";
import { cents } from "../seatTally";
import { changeOver, signedPoints } from "../trace";
import type { Board } from "../useBoard";
import { addToWatchlist, type Watchlist } from "../watchlist";

/** The viewer's races, each with its leader's price and 24-hour move. Kept in this browser only. */
export function WatchlistPanel({ watch, board, onPick }: { watch: Watchlist; board: Board; onPick: (code: string) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const byTicker = historyByTicker(useMarketHistory(watch.list, WATCH_DAYS).data);

  const add = () => {
    const result = addToWatchlist(watch.list, text);
    if ("error" in result) return setMessage({ text: result.error, error: true });
    watch.set(result.list);
    setText("");
    setMessage({ text: `Added ${raceLabel(result.code)}.`, error: false });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };

  return (
    <Panel id="watchlist" flush title={`Watchlist · ${watch.list.length}`}
      meta={<>
        <span>{watch.custom ? "Your list · this browser" : "Default · swing states"}</span>
        {watch.custom && <button type="button" className="wr-mini" onClick={() => { watch.reset(); setMessage({ text: "Back to the swing-state default.", error: false }); }}>Reset</button>}
      </>}>
      {watch.list.length === 0 && <p className="wr-watch-empty">Your watchlist is empty. Star a race on its target card, or add one below.</p>}
      <ul className="wr-watch">
        {watch.list.map((code) => {
          const house = !code.endsWith("-SEN");
          const race = (house ? board.house : board.senate)?.races.get(house ? code : raceState(code));
          const leader = race?.leader ?? null;
          const senate = SENATE_RACES_2026[raceState(code)];
          const desc = house
            ? `House · ${race?.holder ? `${race.holder.vacant ? "vacant, " : ""}${partyLetter(race.holder.party)}-held` : "holder loading"}`
            : `${senate?.special ? "Special" : senate?.open ? "Open" : "Incumbent"} · ${senate?.holder}-held`;
          const move = leader ? changeOver(byTicker.get(leader.market.ticker)?.points ?? [], 24) : null;
          const price = leader ? `${partyLetter(leader.party)} ${cents(leader.price)}` : board.marketCount === null ? "…" : race?.markets.length ? "NO PRICE" : "NO MKT";
          return (
            <li key={code}>
              <button type="button" className="wr-watch-row" onClick={() => onPick(code)}
                aria-label={`${raceLabel(code)}, ${desc}, ${leader ? `${leader.market.outcome} leads at ${cents(leader.price)}` : "no price"}. Show on the map`}>
                <strong>{raceLabel(code)}</strong>
                <span className="wr-watch-desc">{desc}</span>
                <span style={{ color: leader ? partyColor(leader.party) : undefined }}>{price}</span>
                <span className="wr-watch-move">{move === null ? "—" : signedPoints(move)}</span>
              </button>
              <button type="button" className="wr-watch-remove" aria-label={`Remove ${raceLabel(code)} from the watchlist`} onClick={() => watch.toggle(code)}>
                <Icon name="close" size={12} strokeWidth={2.5} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="wr-watch-add">
        <label className="wr-sr-only" htmlFor="wr-watch-add">Add a race to the watchlist</label>
        <input id="wr-watch-add" type="text" value={text} onChange={(event) => { setText(event.target.value); setMessage(null); }} onKeyDown={onKeyDown}
          placeholder="Add race · ME-SEN, PA-08, Ohio" autoComplete="off" spellCheck={false} />
        <button type="button" className="wr-btn" data-tone="accent" onClick={add}>Add</button>
      </div>
      <p className="wr-watch-msg" role="status" data-error={message?.error || undefined}>{message?.text ?? ""}</p>
    </Panel>
  );
}
