import { useQuery } from "@tanstack/react-query";
import { pastResultsEnabled } from "@/lib/featureFlags";

/**
 * Past results from MIT Election Lab files, converted to static JSON by
 * `npm run build:past-results` (CODE/scripts/build-past-results.mjs). Only vote
 * counts are stored; every share, margin, and shift is computed here.
 */

export type PastOffice = "president" | "senate" | "house";
export type PastMetric = "winner" | "shift";
export type Party = "D" | "R" | "O";
export const PAST_OFFICES: PastOffice[] = ["president", "senate", "house"];
export const pastOfficeLabels: Record<PastOffice, string> = { president: "President", senate: "U.S. Senate", house: "U.S. House" };

export interface PastOfficeMeta {
  years: number[];
  levels: string[];
  /** House only: the years whose district lines match the outlines the map draws. */
  mapYears?: number[];
  dataset: string;
  doi: string;
  version: string;
  attribution: string;
}
export interface PastMeta {
  generatedAt: string;
  offices: Record<PastOffice, PastOfficeMeta>;
  countyNotes: Record<string, string>;
}

export interface RaceCandidate { name: string; party: Party; partyDetailed: string; votes: number | null; writein?: boolean }
export interface Race {
  special: boolean;
  stage: "GEN" | "RUNOFF";
  heldIn?: number;
  unofficial?: boolean;
  firstRound?: boolean;
  status?: "unopposed";
  candidates: RaceCandidate[];
}
/** `[Democratic, Republican, everyone else]` votes. */
export type VoteTriple = [number, number, number];
export interface PresidentYear {
  office: "president";
  year: number;
  candidates: { D: string; R: string };
  states: Record<string, { votes: VoteTriple; others: Array<[string, string, number]> }>;
  counties: Record<string, VoteTriple>;
}
export interface SenateYear { office: "senate"; year: number; states: Record<string, Race[]> }
export interface HouseYear { office: "house"; year: number; districts: Record<string, Race[]> }
export type PastYear = PresidentYear | SenateYear | HouseYear;
export interface PresidentSeries { years: number[]; states: Record<string, Array<number | null>>; counties: Record<string, Array<number | null>> }

const BASE = `${import.meta.env.BASE_URL}data/past-results`;

async function getJson<T>(name: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}/${name}`, { signal });
  // A missing static file can come back as the app's index.html instead of a 404.
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) throw new Error(`${name} is not available`);
  return response.json() as Promise<T>;
}

// The files change only when someone reruns the conversion and redeploys.
const STATIC = { staleTime: Infinity, gcTime: 30 * 60_000, retry: 1 } as const;

export function usePastMeta(enabled: boolean) {
  return useQuery<PastMeta, Error>({ queryKey: ["past-results", "meta"], queryFn: ({ signal }) => getJson("meta.json", signal), enabled: pastResultsEnabled && enabled, ...STATIC });
}

export function usePastYear<T extends PastYear>(office: PastOffice, year: number | null) {
  return useQuery<T, Error>({
    queryKey: ["past-results", office, year],
    queryFn: ({ signal }) => getJson(`${office}-${year}.json`, signal),
    enabled: pastResultsEnabled && year !== null,
    ...STATIC,
  });
}

export function usePresidentSeries(enabled: boolean) {
  return useQuery<PresidentSeries, Error>({ queryKey: ["past-results", "president-series"], queryFn: ({ signal }) => getJson("president-series.json", signal), enabled: pastResultsEnabled && enabled, ...STATIC });
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const round1 = (value: number) => Math.round(value * 10) / 10;

export type AreaStatus = "ok" | "no_race" | "unopposed" | "not_reported";

/** One place's result for the chosen office and year, ready for the map, tooltip, and panel. */
export interface AreaResult {
  status: AreaStatus;
  winner?: { name: string; party: Party; pct: number | null };
  runnerUp?: { name: string; party: Party; pct: number };
  /** Winner's share minus the runner-up's, in points. */
  margin?: number;
  /** President only: shares of all votes cast for the office. */
  shares?: { d: number; r: number; o: number };
  total?: number;
  race?: Race;
}

/** Shares are of all votes for the office, including third parties and write-ins. */
export function presidentResult(votes: VoteTriple | undefined, names: { D: string; R: string }): AreaResult {
  if (!votes) return { status: "not_reported" };
  const [d, r, o] = votes;
  const total = d + r + o;
  if (total === 0) return { status: "not_reported" };
  const shares = { d: pct(d, total), r: pct(r, total), o: pct(o, total) };
  const demWon = d >= r;
  return {
    status: "ok",
    winner: { name: demWon ? names.D : names.R, party: demWon ? "D" : "R", pct: demWon ? shares.d : shares.r },
    runnerUp: { name: demWon ? names.R : names.D, party: demWon ? "R" : "D", pct: demWon ? shares.r : shares.d },
    margin: Math.abs(shares.d - shares.r),
    shares,
    total,
  };
}

/**
 * The race that decided the seat: the regular election (its runoff when one was held), or a special
 * when there was no regular race, as in Texas's court-ordered 1996 and 2006 House elections.
 */
export function decisiveRace(races: Race[] | undefined): Race | undefined {
  if (!races?.length) return undefined;
  const pick = (special: boolean) => races.find((race) => race.special === special && race.stage === "RUNOFF") ?? races.find((race) => race.special === special && race.stage === "GEN");
  return pick(false) ?? pick(true);
}

export function raceResult(race: Race | undefined): AreaResult {
  if (!race) return { status: "no_race" };
  const [first, second] = race.candidates;
  if (race.status === "unopposed") return { status: "unopposed", winner: first && { name: first.name, party: first.party, pct: null }, race };
  const total = race.candidates.reduce((sum, candidate) => sum + (candidate.votes ?? 0), 0);
  if (!first || total === 0) return { status: "not_reported", race };
  const winnerPct = pct(first.votes ?? 0, total);
  const runnerPct = second ? pct(second.votes ?? 0, total) : 0;
  return {
    status: "ok",
    winner: { name: first.name, party: first.party, pct: winnerPct },
    ...(second ? { runnerUp: { name: second.name, party: second.party, pct: runnerPct } } : {}),
    margin: winnerPct - runnerPct,
    total,
    race,
  };
}

export interface ShiftResult {
  comparable: boolean;
  /** Later margin minus earlier margin, where margin is Democratic share minus Republican share. Positive is toward Democrats. */
  marginShift?: number;
  demShift?: number;
  repShift?: number;
  otherShift?: number;
  /** Percent change in total votes for president. */
  turnoutChange?: number;
}

/** Computed only when the same place reported in both years; boundary changes make it "not comparable". */
export function shiftResult(earlier: VoteTriple | undefined, later: VoteTriple | undefined): ShiftResult {
  if (!earlier || !later) return { comparable: false };
  const a = presidentResult(earlier, { D: "", R: "" });
  const b = presidentResult(later, { D: "", R: "" });
  if (a.status !== "ok" || b.status !== "ok") return { comparable: false };
  return {
    comparable: true,
    marginShift: (b.shares!.d - b.shares!.r) - (a.shares!.d - a.shares!.r),
    demShift: b.shares!.d - a.shares!.d,
    repShift: b.shares!.r - a.shares!.r,
    otherShift: b.shares!.o - a.shares!.o,
    turnoutChange: pct(b.total! - a.total!, a.total!),
  };
}

// ---------------------------------------------------------------------------
// Colour bins (validated with the dataviz palette checker on the dark basemap)
// ---------------------------------------------------------------------------

/** Margin bins in points, the same for every party: under 1, 1–5, 5–10, 10–20, 20+. */
export const MARGIN_BREAKS = [1, 5, 10, 20];
/** Shift bins in points toward either party: under 0.5 is "about the same", then 0.5–2, 2–5, 5–10, 10+. */
export const SHIFT_BREAKS = [0.5, 2, 5, 10];

/** Dark to light: on the dark basemap a wider margin gets more contrast. */
const RAMPS: Record<Party, string[]> = {
  D: ["#1d5caa", "#2c74cd", "#438ceb", "#69a6f8", "#93c1fe"],
  R: ["#a03130", "#c24341", "#e05a56", "#f07e77", "#fda19a"],
  // Independents and third parties get their own hue, never the colour of a party they caucus with.
  O: ["#026e5b", "#088871", "#05a388", "#4cbba1", "#81d0bb"],
};
export const STATUS_COLORS: Record<Exclude<AreaStatus, "ok"> | "not_comparable" | "no_shift", string> = {
  no_race: "#3b4049",
  unopposed: "#8a909a",
  not_reported: "#24282e",
  not_comparable: "#24282e",
  no_shift: "#4a4c50",
};

const binIndex = (value: number, breaks: number[]) => breaks.filter((limit) => value >= limit).length;

export function winnerBin(result: AreaResult): string {
  if (result.status !== "ok") return result.status;
  return `${result.winner!.party}${binIndex(result.margin!, MARGIN_BREAKS)}`;
}

export function shiftBin(shift: ShiftResult): string {
  if (!shift.comparable) return "not_comparable";
  const size = Math.abs(shift.marginShift!);
  if (size < SHIFT_BREAKS[0]) return "no_shift";
  return `S${shift.marginShift! > 0 ? "D" : "R"}${binIndex(size, SHIFT_BREAKS) - 1}`;
}

/** Every bin key and its colour, for the map's paint expression and the legend. */
export const BIN_COLORS: Record<string, string> = {
  ...Object.fromEntries((["D", "R", "O"] as Party[]).flatMap((party) => RAMPS[party].map((color, i) => [`${party}${i}`, color]))),
  ...Object.fromEntries((["D", "R"] as const).flatMap((party) => [0, 1, 3, 4].map((step, i) => [`S${party}${i}`, RAMPS[party][step]]))),
  ...STATUS_COLORS,
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** MEDSL names are in capitals ("JOSEPH R BIDEN JR"); show "Joseph R Biden Jr" without reordering. */
export function personName(raw: string) {
  if (raw !== raw.toUpperCase()) return raw;
  return raw.toLowerCase()
    .replace(/(^|[\s'"(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(Ii|Iii|Iv)\b/g, (numeral) => numeral.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_, ch: string) => `Mc${ch.toUpperCase()}`);
}

export const partyWords: Record<Party, string> = { D: "Democrat", R: "Republican", O: "Independent or third party" };
export const partyPlural: Record<"D" | "R", string> = { D: "Democrats", R: "Republicans" };

export function partyLabel(candidate: { party: Party; partyDetailed?: string }) {
  if (candidate.party !== "O") return candidate.party;
  const label = candidate.partyDetailed?.split(", ")[0];
  return label ? personName(label) : "Ind.";
}

export const formatPts = (value: number) => `${round1(Math.abs(value)).toFixed(1)}`;

/** "Joseph R Biden Jr (D) won by 4.2 points", or the reason there is no winner to show. */
export function describeResult(result: AreaResult, office: PastOffice, year: number): string[] {
  if (result.status === "no_race") return [`No ${office === "senate" ? "Senate" : "House"} race in ${year}`];
  if (result.status === "not_reported") return ["Not reported for this area"];
  const who = `${personName(result.winner!.name)} (${result.winner!.party === "O" ? "Ind./other" : result.winner!.party})`;
  if (result.status === "unopposed") return [`${who} won unopposed`, "No vote count reported"];
  const lines = [`${who} won by ${formatPts(result.margin!)} points`];
  if (result.race?.stage === "RUNOFF") lines.push(`Decided in a runoff${result.race.heldIn ? ` (${result.race.heldIn})` : ""}`);
  if (result.race?.firstRound) lines.push("First-round votes (ranked-choice)");
  return lines;
}

export function describeShift(shift: ShiftResult, from: number, to: number): string[] {
  if (!shift.comparable) return [`${from} → ${to}: not comparable (boundaries or reporting changed)`];
  const size = Math.abs(shift.marginShift!);
  if (size < SHIFT_BREAKS[0]) return [`${from} → ${to}: margin about the same (under 0.5 points)`];
  return [`${from} → ${to}: shifted ${formatPts(size)} points toward ${partyPlural[shift.marginShift! > 0 ? "D" : "R"]}`];
}
