import type { ReactNode } from "react";
import { historyByTicker, useMarketHistory } from "@/features/election-monitor/marketHistory";
import type { OddsRace } from "@/features/election-monitor/oddsMap";
import { decisiveRace, raceResult, usePastYear, type HouseYear } from "@/features/election-monitor/pastResults";
import { isRedistricted } from "@/features/election-monitor/map/redistricting";
import { PollSummary } from "@/features/polls/PollSummary";
import { pollsEnabled } from "@/lib/featureFlags";
import { HOUSE_APPORTIONMENT, SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import { PriceTrace } from "../charts";
import { etClock, etDate } from "../countdown";
import { Panel } from "../panels/Panel";
import { heldBy, partyColor, partyLetter } from "../party";
import { STATE_NAMES, raceDistrict, raceLabel, raceState } from "../raceCodes";
import { cents } from "../seatTally";
import { HOUR_MS, changeOver, signedPoints } from "../trace";
import { TARGET_DAYS } from "../queries";
import { marginText } from "../terrain";
import type { Board } from "../useBoard";

function holderText(race: OddsRace | undefined, code: string) {
  const holder = race?.holder;
  if (!holder) return "Not loaded";
  const who = `${holder.name} (${partyLetter(holder.party)})`;
  if (holder.vacant) return `Vacant · last held by ${who}`;
  if (code.endsWith("-SEN") && SENATE_RACES_2026[raceState(code)]?.open) return `${who} · not running`;
  return who;
}

/** What kind of race it is: open, special, or an incumbent running. */
function raceKind(code: string) {
  const district = raceDistrict(code);
  if (district) return `U.S. House · ${STATE_NAMES[raceState(code)]}${district === "00" ? " · at-large" : ""}`;
  const race = SENATE_RACES_2026[raceState(code)];
  return `U.S. Senate · ${race?.special ? "Special election" : race?.open ? "Open seat" : "Incumbent running"}`;
}

function Row({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return <><dt>{label}</dt><dd style={{ color }}>{children}</dd></>;
}

/** The selected race: prices, a 14-day trace, who holds it, and whether the leader would flip it. */
function RaceTarget({ code, race, board, actions }: { code: string; race: OddsRace | undefined; board: Board; actions: ReactNode }) {
  const house = !code.endsWith("-SEN");
  const history = useMarketHistory([code], TARGET_DAYS);
  const byTicker = historyByTicker(history.data);
  const past = usePastYear<HouseYear>("house", house ? 2024 : null);
  const leader = race?.leader ?? null;
  const priced = (race?.markets ?? []).filter((market) => market.pricePercent !== null).sort((a, b) => b.pricePercent! - a.pricePercent!);
  const [first, second] = priced;
  // Two parties side by side, D on the left; with an independent in the top two, leader first.
  const pair = first && second ? (first.party === "R" && second.party === "D" ? [second, first] : [first, second]) : null;
  const leftShare = pair ? (pair[0].pricePercent! / (pair[0].pricePercent! + pair[1].pricePercent!)) * 100 : 50;
  const points = leader ? byTicker.get(leader.market.ticker)?.points ?? [] : [];
  const move = changeOver(points, 24);
  const end = Date.now();
  const domain: [number, number] = [end - TARGET_DAYS * 24 * HOUR_MS, end];
  const pastRace = house && past.data ? decisiveRace(past.data.districts[code]) : undefined;
  const flip = !race || !leader ? (race?.markets.length ? "No price yet" : "Not priced") : race.flip ? `Yes · ${partyLetter(leader.party)} leads ${heldBy(race.holder?.party)} seat`
    : race.redistricted && race.holder && race.holder.party !== leader.party ? "Redrawn seat · not compared" : "No";

  return (
    <>
      {pair ? (
        <div className="wr-target-odds">
          <div className="wr-target-prices">
            <span style={{ color: partyColor(pair[0].party) }}>{partyLetter(pair[0].party)} {cents(pair[0].pricePercent!)}</span>
            <span style={{ color: partyColor(pair[1].party) }}>{partyLetter(pair[1].party)} {cents(pair[1].pricePercent!)}</span>
          </div>
          <div className="wr-target-bar" aria-hidden="true">
            <span style={{ width: `${leftShare}%`, background: partyColor(pair[0].party) }} />
            <span style={{ background: partyColor(pair[1].party) }} />
          </div>
        </div>
      ) : (
        <p className="wr-status" role="status">{race?.markets.length ? "Kalshi market open, no price yet" : board.marketCount === null ? "Waiting for Kalshi prices…" : "No Kalshi market for this race"}</p>
      )}
      {leader && (
        <div>
          <PriceTrace series={[{ key: leader.market.ticker, label: partyLetter(leader.party), color: partyColor(leader.party), points }]} domain={domain} height={64}
            label={points.length ? `Leader's hourly price over ${TARGET_DAYS} days, ending at ${cents(points[points.length - 1][1])}` : "No stored price history yet"} />
          <div className="wr-axis"><span>{etDate(domain[0])}</span><span>Leader price · {TARGET_DAYS}D</span><span>Now</span></div>
        </div>
      )}
      <dl className="wr-target-dl">
        <Row label="Seat held by">{holderText(race, code)}</Row>
        <Row label="Market leader" color={leader ? partyColor(leader.party) : undefined}>{leader ? `${leader.market.outcome} · ${cents(leader.price)}` : "None"}</Row>
        <Row label="24H move">{move === null ? "—" : `${signedPoints(move)} pts`}</Row>
        <Row label="Flip watch" color={race?.flip ? "var(--wr-accent)" : undefined}>{flip}</Row>
        {house
          ? <Row label={isRedistricted(raceState(code)) ? "2024 result · old lines" : "2024 result"}>{past.isError ? "Unavailable" : past.data ? marginText(raceResult(pastRace)) : "…"}</Row>
          : <Row label="Last tick">{leader ? `${etClock(Date.parse(leader.market.updatedAt))} ET` : "—"}</Row>}
      </dl>
      {pollsEnabled && <PollSummary race={code} />}
      {actions}
    </>
  );
}

export function TargetCard({ code, state, board, watching, onToggleWatch, onShowDistricts, dossier }: {
  code: string | null;
  state: string | null;
  board: Board;
  watching: boolean;
  onToggleWatch: (code: string) => void;
  onShowDistricts: () => void;
  /** A link to the race's dossier, when that screen exists. */
  dossier?: ReactNode;
}) {
  const house = code ? !code.endsWith("-SEN") : false;
  const race = code ? (house ? board.house : board.senate)?.races.get(house ? code : raceState(code)) : undefined;
  const actions = code && (
    <div className="wr-target-actions">
      <button type="button" className="wr-btn" aria-pressed={watching} onClick={() => onToggleWatch(code)}>{watching ? "★ Watching" : "☆ Watch"}</button>
      {dossier}
    </div>
  );
  return (
    <Panel strong brackets="top" className="wr-target" title={code ? `Target // ${house ? "House" : "Senate"}` : "Target // none"} meta={code ? raceLabel(code) : undefined}>
      {code ? (
        <>
          <div>
            <p className="wr-target-name">{house ? raceLabel(code) : STATE_NAMES[raceState(code)]}</p>
            <p className="wr-target-kind">{raceKind(code)}</p>
          </div>
          <RaceTarget key={code} code={code} race={race} board={board} actions={actions} />
        </>
      ) : state ? (
        <>
          <p className="wr-target-name">{STATE_NAMES[state] ?? state}</p>
          <div className="wr-target-empty">
            <span>No Senate race on the 2026 ballot here.</span>
            <span className="wr-mono">House seats · {HOUSE_APPORTIONMENT[state] ?? "—"}</span>
            {HOUSE_APPORTIONMENT[state] && <button type="button" className="wr-btn" onClick={onShowDistricts}>Show districts</button>}
          </div>
        </>
      ) : (
        <p className="wr-target-hint">Select a state or district on the map, pick a race on the watchlist, or search for one.</p>
      )}
    </Panel>
  );
}
