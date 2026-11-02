import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/apiBase";
import { earlyVoteEnabled } from "@/lib/featureFlags";

/**
 * GET /api/early-vote and /api/early-vote/:state (PLAN.md §4.1, "Early vote tracker"): ballots requested, mail
 * ballots returned, and in-person early votes from civicAPI, by state and county, split by party registration
 * where the state publishes it. Party is registration, not vote choice, and early ballots are not results.
 */

export const EARLY_VOTE_CATEGORIES = ["returned", "inperson", "requested"] as const;
export type EarlyVoteCategory = (typeof EARLY_VOTE_CATEGORIES)[number];
export const CATEGORY_SHORT: Record<EarlyVoteCategory, string> = { returned: "Returned", inperson: "In person", requested: "Requested" };

export type PartyKey = "dem" | "rep" | "npa" | "other" | "unknown";
export interface Tally { total: number; parties: Record<PartyKey, number> }
export interface StateCategoryView extends Tally { asOf: string | null; changedAt: string | null }
export interface EarlyVoteStateRow { state: string; categories: Partial<Record<EarlyVoteCategory, StateCategoryView>> }
export interface CategorySummary {
  label: string;
  available: boolean;
  total: Tally;
  states: number;
  partyStates: number;
  asOfRange: { oldest: string; newest: string } | null;
  undated: number;
}
export interface EarlyVoteSource { name: string; url: string; attribution: string }
export interface EarlyVoteNational {
  categories: Record<EarlyVoteCategory, CategorySummary>;
  states: EarlyVoteStateRow[];
  checkedAt: string;
  changedAt: string | null;
  refreshSeconds: number;
  source: EarlyVoteSource;
}
export interface StateCategoryDetail extends StateCategoryView {
  label: string;
  electionName: string | null;
  counties: Array<{ name: string } & Tally>;
}
export interface EarlyVoteStateDetail {
  state: string;
  categories: Partial<Record<EarlyVoteCategory, StateCategoryDetail>>;
  checkedAt: string;
  source: EarlyVoteSource;
}

/** Browsers check every minute while the tab is visible; the API reads civicAPI at most every two. */
export const EARLY_VOTE_REFRESH_MS = 60_000;

async function getData<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  // 404 with the feature off on the backend: say so rather than show an error.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Early vote returned ${response.status}`);
  return ((await response.json()) as { data: T }).data;
}

const live = {
  enabled: earlyVoteEnabled,
  refetchInterval: EARLY_VOTE_REFRESH_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  staleTime: 30_000,
  retry: 1,
} as const;

export function useEarlyVote() {
  return useQuery({ ...live, queryKey: ["war-room", "early-vote"], queryFn: ({ signal }) => getData<EarlyVoteNational>("/api/early-vote", signal) });
}

export function useStateEarlyVote(state: string | null) {
  return useQuery({
    ...live,
    enabled: earlyVoteEnabled && !!state,
    queryKey: ["war-room", "early-vote", state],
    queryFn: ({ signal }) => getData<EarlyVoteStateDetail>(`/api/early-vote/${state}`, signal),
  });
}

export interface PartySplit {
  /** Ballots with a published party registration. */
  known: number;
  /** Shares of `known`, in percent. */
  shares: { dem: number; rep: number; npa: number; other: number };
  /** Ballots whose party the state doesn't publish. */
  unknown: number;
  /** Democratic minus Republican share of `known`, in points. */
  gap: number;
}

/** The party registration split of a tally, or null when none of it has a published party (never a 0–0 split). */
export function partySplit(tally: Tally): PartySplit | null {
  const { dem, rep, npa, other, unknown } = tally.parties;
  const known = dem + rep + npa + other;
  if (known === 0) return null;
  const share = (value: number) => (value / known) * 100;
  return { known, unknown, shares: { dem: share(dem), rep: share(rep), npa: share(npa), other: share(other) }, gap: share(dem) - share(rep) };
}

/**
 * True when a state lists no separate unaffiliated count but does list "Other": civicAPI then appears to count
 * unaffiliated voters under Other (Arizona, Colorado and Oregon on Nov 2, where unaffiliated voters are a large
 * group), so Other is labelled as possibly including them, and "No party" is shown as not listed, not 0%.
 */
export const otherMayIncludeUnaffiliated = (tally: Tally) => tally.parties.npa === 0 && tally.parties.other > 0;

/** A party's share for a table cell, or "—" when civicAPI lists nothing under that label for the place. */
export const shareCell = (split: PartySplit, tally: Tally, key: "dem" | "rep" | "npa" | "other") => (tally.parties[key] > 0 ? pct(split.shares[key]) : "—");

/** "D +5.2", "R +0.4", or "Even" for a registration gap in points. */
export function gapLabel(gap: number) {
  const rounded = Math.round(Math.abs(gap) * 10) / 10;
  if (rounded === 0) return "Even";
  return `${gap > 0 ? "D" : "R"} +${rounded.toFixed(1)}`;
}

export const pct = (value: number) => `${value >= 9.95 || value === 0 ? value.toFixed(0) : value.toFixed(1)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 2" for "2026-11-02", read as a calendar date (no time zone shift). */
export function dayLabel(date: string | null) {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : "—";
}

export type EarlyVoteSort = "total" | "gap" | "name";

/** States in a category, sorted. Rows without a party split sort after the rest by gap, never as "Even". */
export function categoryRows(data: EarlyVoteNational, category: EarlyVoteCategory, sort: EarlyVoteSort, names: Record<string, string> = {}) {
  const rows = data.states.flatMap((row) => {
    const view = row.categories[category];
    return view ? [{ state: row.state, name: names[row.state] ?? row.state, view, split: partySplit(view) }] : [];
  });
  return rows.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "gap") {
      if (!a.split || !b.split) return (a.split ? 0 : 1) - (b.split ? 0 : 1) || b.view.total - a.view.total;
      return Math.abs(b.split.gap) - Math.abs(a.split.gap) || b.view.total - a.view.total;
    }
    return b.view.total - a.view.total || a.name.localeCompare(b.name);
  });
}

/** States whose number in a category changed between two answers, for a brief highlight. New states don't count. */
export function changedStates(previous: EarlyVoteNational | null | undefined, next: EarlyVoteNational | null | undefined, category: EarlyVoteCategory) {
  const changed = new Set<string>();
  if (!previous || !next) return changed;
  const before = new Map(previous.states.map((row) => [row.state, row.categories[category]]));
  for (const row of next.states) {
    const a = before.get(row.state);
    const b = row.categories[category];
    if (a && b && (a.total !== b.total || (Object.keys(b.parties) as PartyKey[]).some((key) => a.parties[key] !== b.parties[key]))) changed.add(row.state);
  }
  return changed;
}
