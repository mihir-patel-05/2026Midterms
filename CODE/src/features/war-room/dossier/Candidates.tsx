import type { UseQueryResult } from "@tanstack/react-query";
import type { RaceOutsideSpending } from "@/lib/api";
import { formatShortDate, initials } from "@/features/election-monitor/constants";
import type { MarketHistory } from "@/features/election-monitor/marketHistory";
import type { MonitorCandidate } from "@/features/election-monitor/types";
import type { KalshiMarket } from "@/features/election-monitor/useKalshiLive";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor } from "../party";
import { cents } from "../seatTally";
import { changeOver, moveArrow, signedPoints } from "../trace";
import { money, type pickCandidates } from "./dossier";

type Picked = ReturnType<typeof pickCandidates>;
type Spending = UseQueryResult<RaceOutsideSpending>;

function outsideFor(spending: Spending, candidate: MonitorCandidate) {
  if (spending.isLoading) return null;
  if (!spending.data || spending.data.coverage.status === "not_synced") return undefined;
  return spending.data.candidates.find((item) => item.candidateId && item.candidateId === candidate.fecId) ?? { support: 0, oppose: 0 };
}

function Card({ candidate, side, market, byTicker, spending }: {
  candidate: MonitorCandidate | null;
  side: "D" | "R";
  market: KalshiMarket | undefined;
  byTicker: Map<string, MarketHistory>;
  spending: Spending;
}) {
  const color = partyColor(side);
  const label = side === "D" ? "Democrat" : "Republican";
  if (!candidate) {
    return (
      <div className="wr-cand" style={{ borderTopColor: color }}>
        <div className="wr-cand-party" style={{ color }}>{label}</div>
        <p className="wr-off-copy">No {label.toLowerCase()} on file for this race.</p>
      </div>
    );
  }
  const move = market ? changeOver(byTicker.get(market.ticker)?.points ?? [], 24) : null;
  const outside = outsideFor(spending, candidate);
  const figure = (value: number | null | undefined) => (value === null || value === undefined ? "—" : money(value));
  const outsideFigure = (value: number | undefined) => (outside === null ? "…" : outside === undefined ? "Not synced" : money(value ?? 0));
  return (
    <div className="wr-cand" style={{ borderTopColor: color }}>
      <div className="wr-cand-top">
        <span className="wr-cand-mono" style={{ color, borderColor: color, background: side === "D" ? "var(--wr-dem-soft)" : "var(--wr-rep-soft)" }} aria-hidden="true">{initials(candidate.name)}</span>
        <div className="wr-cand-who">
          <div className="wr-cand-party" style={{ color }}>{label} · {candidate.ballotStatus === "UNCONFIRMED" ? "Ballot unconfirmed" : "On ballot"}</div>
          <h3 className="wr-cand-name">{candidate.name}</h3>
          <div className="wr-cand-note">{[candidate.isIncumbent ? "Incumbent" : null, candidate.fundingThrough ? `FEC through ${formatShortDate(candidate.fundingThrough)}` : "No FEC report on file"].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="wr-cand-price">
          <strong style={{ color }}>{market?.pricePercent != null ? cents(market.pricePercent) : "—"}</strong>
          <span>{move === null ? "Kalshi" : `${moveArrow(move)} ${signedPoints(move)} / 24H`.trim()}</span>
        </div>
      </div>
      <dl className="wr-cand-figs">
        <div><dt>Receipts</dt><dd>{figure(candidate.receipts)}</dd></div>
        <div><dt>Cash on hand</dt><dd>{figure(candidate.cashOnHand)}</dd></div>
        <div><dt>Outside · for</dt><dd>{outsideFigure(outside?.support)}</dd></div>
        <div><dt>Outside · against</dt><dd>{outsideFigure(outside?.oppose)}</dd></div>
      </dl>
    </div>
  );
}

/** The Democrat and the Republican side by side, with their Kalshi price, FEC totals, and outside money. */
export function Candidates({ id, picked, markets, byTicker, spending, contestsLoading, contestsError, boardReady }: {
  id: string;
  picked: Picked;
  markets: KalshiMarket[];
  byTicker: Map<string, MarketHistory>;
  spending: Spending;
  contestsLoading: boolean;
  contestsError: boolean;
  boardReady: boolean;
}) {
  const others = markets.filter((market) => market.party !== "D" && market.party !== "R" && market.pricePercent !== null);
  return (
    <Panel id={id} flush title="Candidates" meta={picked.others > 0 ? `${picked.others} more FEC filers on file` : "FEC · Kalshi"}
      footnote={others.length ? `Kalshi also prices ${others.map((market) => `${market.outcome} ${cents(market.pricePercent!)}`).join(", ")}` : undefined}>
      {contestsLoading ? <StatusLine>Loading candidates…</StatusLine> : contestsError ? <StatusLine tone="warn">Candidates unavailable</StatusLine> : (
        <div className="wr-cands">
          <Card candidate={picked.d} side="D" market={markets.find((market) => market.party === "D")} byTicker={byTicker} spending={spending} />
          <div className="wr-versus" aria-hidden="true">Versus</div>
          <Card candidate={picked.r} side="R" market={markets.find((market) => market.party === "R")} byTicker={byTicker} spending={spending} />
        </div>
      )}
      {!boardReady && <StatusLine>Waiting for Kalshi prices…</StatusLine>}
    </Panel>
  );
}
