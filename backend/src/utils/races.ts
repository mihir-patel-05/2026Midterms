import { HOUSE_SEATS } from './house-seats.js';

export interface Race {
  state: string;
  officeType: 'HOUSE' | 'SENATE';
  /** Two-digit House district ("00" at-large); null for the Senate. */
  district: string | null;
}

/**
 * States with a Senate race on the ballot, by cycle. 2026 has the 33 Class 2
 * seats plus specials in Ohio (Vance's seat) and Florida (Rubio's seat). Keep
 * in step with SENATE_RACES_2026 in the web app's simulator.
 */
export const SENATE_RACE_STATES: Record<number, readonly string[]> = {
  2026: [
    'AL', 'AK', 'AR', 'CO', 'DE', 'FL', 'GA', 'IA', 'ID', 'IL', 'KS', 'KY',
    'LA', 'MA', 'ME', 'MI', 'MN', 'MS', 'MT', 'NC', 'NE', 'NH', 'NJ', 'NM',
    'OH', 'OK', 'OR', 'RI', 'SC', 'SD', 'TN', 'TX', 'VA', 'WV', 'WY',
  ],
};

/** Puerto Rico's Resident Commissioner serves four years, elected with the president. */
const holdsHouseRace = (state: string, cycle: number) => state !== 'PR' || cycle % 4 === 0;

type RaceLike = { state: string; officeType: string; district: string | null };

export const raceKey = (race: RaceLike) => `${race.state}-${race.officeType}-${race.district ?? 'statewide'}`;

/** `CA-07`, `DE-00`, or `GA-SEN`, for log lines. */
export const raceLabel = (race: RaceLike) => `${race.state}-${race.officeType === 'SENATE' ? 'SEN' : race.district}`;

/**
 * Every House and Senate race on the general election ballot in a cycle: all
 * 435 seats, the delegates elected that year, and the Senate seats up. Null
 * for a cycle with no Senate roster here, so callers fall back to FEC filings.
 */
export function ballotRaces(cycle: number): Race[] | null {
  const senate = SENATE_RACE_STATES[cycle];
  if (!senate) return null;
  const house = Object.entries(HOUSE_SEATS)
    .filter(([state]) => holdsHouseRace(state, cycle))
    .flatMap(([state, seats]): Race[] =>
      seats === 1
        ? [{ state, officeType: 'HOUSE', district: '00' }]
        : Array.from({ length: seats }, (_, i) => ({ state, officeType: 'HOUSE' as const, district: String(i + 1).padStart(2, '0') })),
    );
  return [...senate.map((state): Race => ({ state, officeType: 'SENATE', district: null })), ...house];
}
