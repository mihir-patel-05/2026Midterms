import { stateMapItems } from "@/features/election-dashboard/map";
import type { MapOverlay } from "@/features/election-monitor/map/ElectionMap";
import type { OddsOffice, OddsRace, OddsView, SeatHolder } from "@/features/election-monitor/oddsMap";
import { HOUSE_DISTRICT_CODES, SENATE_RACES_2026 } from "@/features/simulator/midterms/races2026";

/**
 * The War Room's two extra map modes, as overlays in the same shape the odds and past-results modes use:
 *
 * - Seat holder: who holds each seat on the 2026 ballot today. An open Senate seat (the incumbent is not running)
 *   or a vacant House seat is drawn dimmer, in its last holder's colour.
 * - Flip watch: races whose Kalshi leader is from a different party than the holder (hatched), and races whose
 *   leader is under 75¢. A redistricted House seat is never a flip, because its holder represents different lines;
 *   that is the odds map's rule too.
 *
 * Colours are solid, for MapLibre, and differ in lightness as well as hue.
 */

export const HOLDER_COLORS: Record<string, string> = {
  D: "#3a6ba1",
  "D-open": "#254364",
  R: "#953935",
  "R-open": "#592626",
  O: "#5b4d99",
  "O-open": "#3a3263",
  unknown: "#2b333d",
  no_race: "#11161d",
};

export const FLIP_COLORS: Record<string, string> = {
  flip: "#ffb020",
  close: "#6b5220",
  safe: "#1f2a36",
  unpriced: "#161c24",
  no_race: "#0f1318",
};

/** Under this price (in cents, the same as percent) a leader counts as close on the flip-watch map. */
export const CLOSE_BELOW = 75;

/** All 50 states and DC, the Senate map's features. */
const STATE_CODES = [...new Set([...stateMapItems.map((item) => item.code), "DC"])];

const holderBin = (party: SeatHolder["party"], open: boolean | undefined) => `${party}${open ? "-open" : ""}`;

/** Each state's Senate seat on the 2026 ballot by holder; states with no race are `no_race`. */
export function senateHolderBins(): Map<string, string> {
  return new Map(STATE_CODES.map((code) => {
    const race = SENATE_RACES_2026[code];
    return [code, race ? holderBin(race.holder, race.open) : "no_race"];
  }));
}

/** Every House seat by holder; a vacant seat keeps its last holder's party. Null until the holders file loads. */
export function houseHolderBins(holders: Map<string, SeatHolder> | null): Map<string, string> | null {
  if (!holders) return null;
  return new Map(HOUSE_DISTRICT_CODES.map((code) => {
    const holder = holders.get(code);
    return [code, holder ? holderBin(holder.party, holder.vacant) : "unknown"];
  }));
}

export function holderOverlay(office: OddsOffice, holders: Map<string, SeatHolder> | null): MapOverlay {
  return {
    bins: office === "senate" ? senateHolderBins() : houseHolderBins(holders),
    colors: HOLDER_COLORS,
    fallback: HOLDER_COLORS.no_race,
    redistricting: true,
  };
}

/** One race's flip-watch bin. */
export function flipBin(race: OddsRace): string {
  if (race.bin === "no_race") return "no_race";
  if (!race.leader) return "unpriced";
  if (race.flip) return "flip";
  return race.leader.price < CLOSE_BELOW ? "close" : "safe";
}

/** The flip-watch map for one chamber's odds view; null while the view is loading. */
export function flipOverlay(view: OddsView | null): MapOverlay {
  return {
    bins: view ? new Map([...view.races.values()].map((race) => [race.code, flipBin(race)])) : null,
    colors: FLIP_COLORS,
    fallback: FLIP_COLORS.no_race,
    redistricting: true,
    hatch: view?.flips,
  };
}

/** How many races are flips and how many more are close, for the legend. */
export function flipCounts(view: OddsView) {
  let flips = 0;
  let close = 0;
  for (const race of view.races.values()) {
    const bin = flipBin(race);
    if (bin === "flip") flips++;
    else if (bin === "close") close++;
  }
  return { flips, close };
}
