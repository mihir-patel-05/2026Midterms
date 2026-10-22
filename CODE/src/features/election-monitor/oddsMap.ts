import { useMemo } from "react";
import { stateMapItems } from "@/features/election-dashboard/map";
import { houseBaseline } from "@/features/simulator/midterms/model";
import { HOUSE_DISTRICT_CODES, SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";
import type { Side } from "@/features/simulator/model";
import { priceTypeLabel } from "./constants";
import { isRedistricted } from "./map/redistricting";
import { usePastYear, type HouseYear } from "./pastResults";
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
  /** Party holding the seat (Senate) or that won it in 2024 (House); null when unknown. */
  holder: Side | null;
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

export function isFlip(leader: RaceLeader | null, holder: Side | null, redistricted: boolean) {
  return Boolean(leader && holder && !redistricted && leader.party !== holder);
}

/** All 50 states and DC; DC and states with no 2026 race are "no race" unless Kalshi lists one. */
const SENATE_CODES = [...new Set([...stateMapItems.map((item) => item.code), "DC"])];

export function buildOddsView(byRace: Map<string, KalshiMarket[]>, office: OddsOffice, houseHolders: Map<string, Side> | null): OddsView {
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
    const holder = office === "senate" ? SENATE_RACES_2026[code]?.holder ?? null : houseHolders?.get(code) ?? null;
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
  if (race.flip) lines.push(office === "senate" ? `Leader differs from the party holding the seat (${race.holder})` : `Leader differs from the 2024 winner (${race.holder})`);
  if (race.redistricted) lines.push("Shape shows 2024 lines; the market is for the 2026 district");
  return lines;
}

/** Live Kalshi markets turned into the odds map for one chamber; null while inactive. */
export function useOddsView(active: boolean, office: OddsOffice): { status: KalshiFeedStatus; view: OddsView | null } {
  const { status, byRace } = useKalshiMarkets();
  // The seats' 2024 winners, for marking House flips.
  const house = usePastYear<HouseYear>("house", active && office === "house" ? 2024 : null);
  const holders = useMemo(() => {
    if (!house.data) return null;
    const seats = new Map<string, Side>();
    for (const [code, seat] of houseBaseline(house.data)) if (seat.winner !== "T") seats.set(code, seat.winner);
    return seats;
  }, [house.data]);
  const view = useMemo(() => (active ? buildOddsView(byRace, office, office === "house" ? holders : null) : null), [active, byRace, office, holders]);
  return { status, view };
}
