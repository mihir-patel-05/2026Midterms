import type { OddsView } from "@/features/election-monitor/oddsMap";
import { HOUSE_DISTRICT_CODES, HOUSE_SEATS, HOUSE_TO_CONTROL, SENATE_NOT_UP, SENATE_RACES_2026, SENATE_SEATS, SENATE_TO_CONTROL } from "@/features/simulator/midterms/races2026";

/**
 * Seats per party if every race went to its Kalshi market leader. It is a count of market leaders, not a forecast:
 * a 51¢ leader counts as a whole seat. Races with no leader (no market, no price, or a tie at the top) are counted
 * by who holds the seat today, and said so; seats not on the ballot are counted by their holder.
 */
export interface SideTally {
  /** Senate seats not on the 2026 ballot. */
  notUp: number;
  /** Races this party's outcome leads on Kalshi. */
  leading: number;
  /** Races with no leader, counted by the seat's holder. */
  byHolder: number;
  total: number;
}

export interface ChamberTally {
  d: SideTally;
  r: SideTally;
  /** Races led by an independent or other outcome. */
  other: number;
  /** Races with no leader and no known holder (the House holders file has not loaded). */
  unknown: number;
  seats: number;
  toControl: number;
}

const side = (notUp: number): SideTally => ({ notUp, leading: 0, byHolder: 0, total: notUp });

function tally(view: OddsView, codes: string[], notUp: { D: number; R: number }, seats: number, toControl: number): ChamberTally {
  const result: ChamberTally = { d: side(notUp.D), r: side(notUp.R), other: 0, unknown: 0, seats, toControl };
  for (const code of codes) {
    const race = view.races.get(code);
    const leader = race?.leader?.party;
    const holder = race?.holder?.party;
    const party = leader ?? holder;
    if (party === "D" || party === "R") {
      const counted = party === "D" ? result.d : result.r;
      if (leader) counted.leading++;
      else counted.byHolder++;
      counted.total++;
    } else if (party === "O") result.other++;
    else result.unknown++;
  }
  return result;
}

export function senateTally(view: OddsView): ChamberTally {
  return tally(view, Object.keys(SENATE_RACES_2026), SENATE_NOT_UP, SENATE_SEATS, SENATE_TO_CONTROL);
}

export function houseTally(view: OddsView): ChamberTally {
  return tally(view, HOUSE_DISTRICT_CODES, { D: 0, R: 0 }, HOUSE_SEATS, HOUSE_TO_CONTROL);
}

/** Races whose leader is priced under `cents`. */
export function leadersUnder(view: OddsView, cents: number) {
  let count = 0;
  for (const race of view.races.values()) if (race.leader && race.leader.price < cents) count++;
  return count;
}

/** "35¢", "35.5¢": whole cents when the price is whole, one decimal otherwise, never rounded across 50. */
export function cents(price: number) {
  return `${Number.isInteger(price) ? price : price.toFixed(1)}¢`;
}
