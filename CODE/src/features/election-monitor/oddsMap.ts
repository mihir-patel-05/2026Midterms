import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { stateMapItems } from "@/features/election-dashboard/map";
import { HOUSE_DISTRICT_CODES, SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import type { Side } from "@/features/simulator/model";
import { priceTypeLabel } from "./constants";
import { isRedistricted } from "./map/redistricting";
import { useKalshiMarkets, type KalshiFeedStatus, type KalshiMarket } from "./useKalshiLive";

/**
 * The Market odds map mode: every Senate state or House district coloured by the outcome its Kalshi
 * market prices highest. Prices are market prices, not forecasts; a race with no market or no price
 * is grey, never 50/50.
 */

export type OddsOffice = "senate" | "house";
export const ODDS_OFFICES: OddsOffice[] = ["senate", "house"];
export type OddsParty = Side | "O";

/** Leader's price in percent: under 60, 60–75, 75–90, 90+. */
export const ODDS_BREAKS = [60, 75, 90];
export const oddsBinLabels = ["<60%", "60–75%", "75–90%", "90%+"];

/**
 * Pale to saturated, so a close race reads pale and a near-certain one reads strong, as on Kalshi's
 * own maps (validated with the dataviz ramp checks on the dark basemap). Independents keep their
 * own hue, as in Past results.
 */
const RAMPS: Record<OddsParty, string[]> = {
  D: ["#a1b3fa", "#8098f7", "#6283f6", "#3a5ff0"],
  R: ["#f3a69e", "#e8857d", "#db6158", "#c8322b"],
  O: ["#8ad8c2", "#5cc8ad", "#3fb497", "#11977a"],
};
export const ODDS_STATUS_COLORS = {
  /** Two outcomes priced the same at the top. */
  even: "#9c8550",
  no_price: "#4a4c50",
  no_market: "#3b4049",
  no_race: "#24282e",
} as const;
export type OddsStatus = keyof typeof ODDS_STATUS_COLORS;
export const ODDS_COLORS: Record<string, string> = {
  ...Object.fromEntries((["D", "R", "O"] as OddsParty[]).flatMap((party) => RAMPS[party].map((color, i) => [`${party}${i}`, color]))),
  ...ODDS_STATUS_COLORS,
};

/** Who holds a seat today. A vacant seat carries its last holder. */
export interface SeatHolder {
  party: OddsParty;
  name: string;
  vacant?: boolean;
  /** Senate only: the senator is not on the 2026 ballot. */
  retiring?: boolean;
}

/** `public/data/seat-holders-2026.json`, written by `npm run build:seat-holders` from congress-legislators. */
export interface SeatHoldersFile {
  generatedAt: string;
  source: string;
  house: Record<string, { party: "D" | "R" | "I"; name: string; since: string }>;
  vacant: Record<string, { party: "D" | "R" | "I"; name: string; until: string }>;
  /** Keyed "GA-2": state and Senate class. */
  senate: Record<string, { party: "D" | "R" | "I"; name: string }>;
}

const toParty = (party: "D" | "R" | "I"): OddsParty => (party === "I" ? "O" : party);

/** Every House seat's holder; vacant seats keep their last holder's party, marked vacant. */
export function houseHolders(file: SeatHoldersFile): Map<string, SeatHolder> {
  const seats = new Map<string, SeatHolder>();
  for (const [code, seat] of Object.entries(file.house)) seats.set(code, { party: toParty(seat.party), name: seat.name });
  for (const [code, seat] of Object.entries(file.vacant)) seats.set(code, { party: toParty(seat.party), name: seat.name, vacant: true });
  return seats;
}

/** The senators whose seats are on the 2026 ballot (`races2026.ts`). */
const SENATE_HOLDERS = new Map<string, SeatHolder>(
  Object.entries(SENATE_RACES_2026).map(([code, race]) => [code, { party: race.holder, name: race.incumbent, retiring: race.open }]),
);

export interface RaceLeader {
  market: KalshiMarket;
  party: OddsParty;
  price: number;
}

export interface OddsRace {
  /** Map feature code: `GA` for the Senate, `PA-07` for the House. */
  code: string;
  markets: KalshiMarket[];
  /** Null when no outcome is priced, or the top two are tied. */
  leader: RaceLeader | null;
  bin: string;
  /** Who holds the seat today; null when unknown. */
  holder: SeatHolder | null;
  flip: boolean;
  /** House only: the state drew new districts for 2026, so the shape on the map is the 2024 one. */
  redistricted: boolean;
}

export interface OddsView {
  office: OddsOffice;
  races: Map<string, OddsRace>;
  bins: Map<string, string>;
  flips: Set<string>;
  /** Races on the 2026 ballot, those with an open market, and those with a price. */
  total: number;
  withMarket: number;
  priced: number;
  lastChange: string | null;
  priceType: string | null;
}

const priced = (markets: KalshiMarket[]) =>
  markets.filter((market): market is KalshiMarket & { pricePercent: number } => market.pricePercent !== null);

/** The outcome priced highest; null with no price or a tie at the top. */
export function raceLeader(markets: KalshiMarket[]): RaceLeader | null {
  const [first, second] = priced(markets).sort((a, b) => b.pricePercent - a.pricePercent);
  if (!first || (second && second.pricePercent === first.pricePercent)) return null;
  return { market: first, party: first.party ?? "O", price: first.pricePercent };
}

export function oddsBin(markets: KalshiMarket[]): string {
  if (markets.length === 0) return "no_market";
  const leader = raceLeader(markets);
  if (!leader) return priced(markets).length === 0 ? "no_price" : "even";
  return `${leader.party}${ODDS_BREAKS.filter((limit) => leader.price >= limit).length}`;
}

export function isFlip(leader: RaceLeader | null, holder: SeatHolder | null, redistricted: boolean) {
  return Boolean(leader && holder && !redistricted && leader.party !== holder.party);
}

/** All 50 states and DC; DC and states with no 2026 race are "no race" unless Kalshi lists one. */
const SENATE_CODES = [...new Set([...stateMapItems.map((item) => item.code), "DC"])];

export function buildOddsView(byRace: Map<string, KalshiMarket[]>, office: OddsOffice, holders: Map<string, SeatHolder> | null): OddsView {
  const races = new Map<string, OddsRace>();
  const included: KalshiMarket[] = [];
  let total = 0;
  let withMarket = 0;
  let pricedRaces = 0;
  const codes = office === "senate" ? SENATE_CODES : HOUSE_DISTRICT_CODES;
  for (const code of codes) {
    const markets = byRace.get(office === "senate" ? `${code}-SEN` : code) ?? [];
    const onBallot = office === "house" || code in SENATE_RACES_2026 || markets.length > 0;
    const redistricted = office === "house" && isRedistricted(code.slice(0, 2));
    const holder = (office === "senate" ? SENATE_HOLDERS.get(code) : holders?.get(code)) ?? null;
    const leader = raceLeader(markets);
    if (onBallot) total++;
    if (markets.length > 0) withMarket++;
    if (priced(markets).length > 0) pricedRaces++;
    included.push(...markets);
    races.set(code, {
      code,
      markets,
      leader,
      bin: onBallot ? oddsBin(markets) : "no_race",
      holder,
      flip: isFlip(leader, holder, redistricted),
      redistricted,
    });
  }
  const withPrice = priced(included);
  const lastChange = withPrice.reduce<string | null>((latest, market) => (latest === null || market.updatedAt > latest ? market.updatedAt : latest), null);
  return {
    office,
    races,
    bins: new Map([...races.values()].map((race) => [race.code, race.bin])),
    flips: new Set([...races.values()].filter((race) => race.flip).map((race) => race.code)),
    total,
    withMarket,
    priced: pricedRaces,
    lastChange,
    priceType: priceTypeLabel(withPrice.map((market) => market.priceType)),
  };
}

const formatPrice = (value: number) => `${Number(value.toFixed(1))}%`;
const partyLetter = (party: OddsParty) => (party === "O" ? "I" : party);

/** "Held by Thom Tillis (R), not running" or "Vacant; last held by Tony Gonzales (R)". */
export function describeHolder(holder: SeatHolder) {
  const who = `${holder.name} (${partyLetter(holder.party)})`;
  return holder.vacant ? `Vacant; last held by ${who}` : `Held by ${who}${holder.retiring ? ", not running" : ""}`;
}

/** The map's hatch layer as a CSS background, layered over a fill colour. */
export const HATCH_BACKGROUND = "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.6) 0 1.5px, transparent 1.5px 5px)";

/** States too small to label on the map; the Senate odds map lists them beside it, as Kalshi does. */
export const CALLOUT_STATES = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"];
const INK = { dark: "#0b0f16", light: "#ffffff", muted: "#8b93a1" } as const;

export interface OddsLabel {
  code: string;
  /** The leader's rounded price ("93%"), "I 55%" for an independent, "Even", or "" with no price. */
  price: string;
  /** Text colour that reads on the bin's fill: dark on the pale bins, white on the strong ones. */
  ink: string;
  color: string;
  hatch: boolean;
}

/** A label for every state on the Senate odds map. */
export function oddsLabels(view: OddsView): OddsLabel[] {
  return [...view.races.values()].map((race) => {
    const leader = race.leader;
    const step = Number(race.bin.slice(1));
    const price = leader ? `${leader.party === "O" ? "I " : ""}${Math.round(leader.price)}%` : race.bin === "even" ? "Even" : "";
    const ink = !leader ? (race.bin === "even" ? INK.light : INK.muted) : step <= 1 ? INK.dark : INK.light;
    return { code: race.code, price, ink, color: ODDS_COLORS[race.bin], hatch: race.flip };
  });
}

/** Tooltip lines for one race. */
export function describeOddsRace(race: OddsRace | undefined, office: OddsOffice): string[] {
  if (!race || race.bin === "no_race") return ["No Senate race in 2026"];
  const lines: string[] = [];
  if (race.markets.length === 0) lines.push("No open Kalshi market");
  else if (race.bin === "no_price") lines.push("Kalshi market open, no price yet");
  else {
    const ranked = priced(race.markets).sort((a, b) => b.pricePercent - a.pricePercent);
    lines.push(...ranked.slice(0, 3).map((market) => `${market.outcome} ${formatPrice(market.pricePercent)}`));
    if (ranked.length > 3) lines.push(`+${ranked.length - 3} more outcomes`);
    if (race.bin === "even") lines.push("Top outcomes priced the same");
  }
  if (race.redistricted) lines.push("Shape shows 2024 lines; the market is for the 2026 district");
  // A redistricted seat's holder represents different lines, so it is not compared.
  else if (race.holder) lines.push(describeHolder(race.holder));
  if (race.flip) lines.push(`Leader is from a different party than ${race.holder!.vacant ? "the last holder" : "the holder"}`);
  return lines;
}

const SEAT_HOLDERS_URL = `${import.meta.env.BASE_URL}data/seat-holders-2026.json`;

/** Who holds each seat; the file changes only when someone reruns the script and redeploys. */
function useSeatHolders(enabled: boolean) {
  return useQuery<SeatHoldersFile, Error>({
    queryKey: ["seat-holders-2026"],
    queryFn: async ({ signal }) => {
      const response = await fetch(SEAT_HOLDERS_URL, { signal });
      // A missing static file can come back as the app's index.html instead of a 404.
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) throw new Error("Seat holders are not available");
      return response.json() as Promise<SeatHoldersFile>;
    },
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

/**
 * Live Kalshi markets turned into the odds map for one chamber; null while inactive. `holdersAsOf`
 * dates the House holders file, for the legend.
 */
export function useOddsView(active: boolean, office: OddsOffice): { status: KalshiFeedStatus; view: OddsView | null; holdersAsOf: string | null } {
  const { status, byRace } = useKalshiMarkets();
  const file = useSeatHolders(active && office === "house");
  const holders = useMemo(() => (file.data ? houseHolders(file.data) : null), [file.data]);
  const view = useMemo(() => (active ? buildOddsView(byRace, office, office === "house" ? holders : null) : null), [active, byRace, office, holders]);
  return { status, view, holdersAsOf: file.data?.generatedAt ?? null };
}
