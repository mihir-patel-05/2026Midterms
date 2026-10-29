import type { OutsideSpendingCoverage } from "@/lib/api";
import type { MonitorCandidate, MonitorContest } from "@/features/election-monitor/types";
import { cents } from "../seatTally";
import { signedPoints } from "../trace";

const isParty = (candidate: MonitorCandidate, word: string) => (candidate.party ?? "").toUpperCase().includes(word);

/**
 * The Democrat and the Republican to set side by side. FEC lists every active filer, primary losers included,
 * and the contest already leads with the incumbent and the biggest fundraisers, so the first of each party is
 * the one on the ballot in nearly every race. Confirmed ballot entries go first when the ballot status is known.
 */
export function pickCandidates(contest: MonitorContest | undefined) {
  const list = [...(contest?.candidates ?? [])].sort((a, b) => Number(b.ballotStatus === "CONFIRMED") - Number(a.ballotStatus === "CONFIRMED"));
  const d = list.find((candidate) => isParty(candidate, "DEM")) ?? null;
  const r = list.find((candidate) => isParty(candidate, "REP")) ?? null;
  return { d, r, others: list.filter((candidate) => candidate !== d && candidate !== r).length };
}

export interface LogEntry {
  at: number;
  /** FEC dates have no time of day. */
  dateOnly: boolean;
  tone: "live" | "accent" | "quiet";
  title: string;
  text: string;
}

export interface RaceLogInputs {
  /** The first stored hour in the history window. */
  historyStart: number | null;
  /** The leader's latest stored price and its 24-hour change. */
  leader: { label: string; price: number; change: number | null; at: number } | null;
  candidates: Array<{ name: string; fundingThrough: string | null }>;
  spending: OutsideSpendingCoverage | null;
  /** End date of the newest poll in the average. */
  newestPoll: string | null;
}

const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);

/** The race's dated events from real sources only, newest first. */
export function buildRaceLog({ historyStart, leader, candidates, spending, newestPoll }: RaceLogInputs): LogEntry[] {
  const entries: LogEntry[] = [];
  if (leader) {
    entries.push({ at: leader.at, dateOnly: false, tone: "live", title: "Kalshi.", text: `${leader.label} ${leader.change === null ? "" : Math.abs(leader.change) < 0.05 ? "unchanged in 24h, " : `${signedPoints(leader.change)} in 24h, `}now ${cents(leader.price)}.` });
  }
  if (spending?.lastSyncedAt) entries.push({ at: Date.parse(spending.lastSyncedAt), dateOnly: false, tone: "accent", title: "Schedule E sync.", text: "Outside spending re-fetched from the FEC." });
  if (spending?.latestExpenditureDate) entries.push({ at: day(spending.latestExpenditureDate), dateOnly: true, tone: "accent", title: "Outside spending.", text: "Latest independent expenditure reported in this race." });
  const byDate = new Map<string, string[]>();
  for (const candidate of candidates) if (candidate.fundingThrough) byDate.set(candidate.fundingThrough, [...(byDate.get(candidate.fundingThrough) ?? []), candidate.name]);
  for (const [date, names] of byDate) entries.push({ at: day(date), dateOnly: true, tone: "accent", title: "FEC report.", text: `${names.join(" and ")} reported through this date.` });
  if (newestPoll) entries.push({ at: day(newestPoll), dateOnly: true, tone: "quiet", title: "Polls.", text: "Newest poll in the average ended." });
  if (historyStart) entries.push({ at: historyStart, dateOnly: false, tone: "quiet", title: "History starts.", text: "First hourly Kalshi snapshot in this window." });
  return entries.sort((a, b) => b.at - a.at);
}

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
/** "$48.6M", "$950K", "$0". */
export const money = (value: number) => compact.format(value);
