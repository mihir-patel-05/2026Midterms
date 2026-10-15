import type { Side } from "../model";

export interface SenateRace {
  /** Party holding the seat going into the election. */
  holder: Side;
  incumbent: string;
  /** The incumbent is not running. */
  open: boolean;
  /** A special election for the rest of a term, after an appointment. */
  special?: boolean;
}

/**
 * The 35 Senate races on the November 2026 ballot: the 33 Class 2 seats, plus specials in Ohio
 * (Vance's seat, now Husted) and Florida (Rubio's seat, now Moody). Incumbents and retirements as
 * of mid-2026. Up: 22 Republican seats and 13 Democratic ones.
 */
export const SENATE_RACES_2026: Record<string, SenateRace> = {
  AL: { holder: "R", incumbent: "Tommy Tuberville", open: true },
  AK: { holder: "R", incumbent: "Dan Sullivan", open: false },
  AR: { holder: "R", incumbent: "Tom Cotton", open: false },
  CO: { holder: "D", incumbent: "John Hickenlooper", open: false },
  DE: { holder: "D", incumbent: "Chris Coons", open: false },
  FL: { holder: "R", incumbent: "Ashley Moody", open: false, special: true },
  GA: { holder: "D", incumbent: "Jon Ossoff", open: false },
  IA: { holder: "R", incumbent: "Joni Ernst", open: true },
  ID: { holder: "R", incumbent: "Jim Risch", open: false },
  IL: { holder: "D", incumbent: "Dick Durbin", open: true },
  KS: { holder: "R", incumbent: "Roger Marshall", open: false },
  KY: { holder: "R", incumbent: "Mitch McConnell", open: true },
  LA: { holder: "R", incumbent: "Bill Cassidy", open: false },
  MA: { holder: "D", incumbent: "Ed Markey", open: false },
  ME: { holder: "R", incumbent: "Susan Collins", open: false },
  MI: { holder: "D", incumbent: "Gary Peters", open: true },
  MN: { holder: "D", incumbent: "Tina Smith", open: true },
  MS: { holder: "R", incumbent: "Cindy Hyde-Smith", open: false },
  MT: { holder: "R", incumbent: "Steve Daines", open: false },
  NC: { holder: "R", incumbent: "Thom Tillis", open: true },
  NE: { holder: "R", incumbent: "Pete Ricketts", open: false },
  NH: { holder: "D", incumbent: "Jeanne Shaheen", open: true },
  NJ: { holder: "D", incumbent: "Cory Booker", open: false },
  NM: { holder: "D", incumbent: "Ben Ray Luján", open: false },
  OH: { holder: "R", incumbent: "Jon Husted", open: false, special: true },
  OK: { holder: "R", incumbent: "Markwayne Mullin", open: false },
  OR: { holder: "D", incumbent: "Jeff Merkley", open: false },
  RI: { holder: "D", incumbent: "Jack Reed", open: false },
  SC: { holder: "R", incumbent: "Lindsey Graham", open: false },
  SD: { holder: "R", incumbent: "Mike Rounds", open: false },
  TN: { holder: "R", incumbent: "Bill Hagerty", open: false },
  TX: { holder: "R", incumbent: "John Cornyn", open: false },
  VA: { holder: "D", incumbent: "Mark Warner", open: false },
  WV: { holder: "R", incumbent: "Shelley Moore Capito", open: false },
  WY: { holder: "R", incumbent: "Cynthia Lummis", open: true },
};

export const SENATE_RACE_CODES = Object.keys(SENATE_RACES_2026);
export const isSenateRace = (code: string) => code in SENATE_RACES_2026;

/**
 * Seats not on the ballot until 2028 or 2030. Angus King (ME) and Bernie Sanders (VT) are
 * independents on paper; they caucus with Democrats, so they count as Democratic seats here.
 */
export const SENATE_NOT_UP: Record<Side, number> = { D: 34, R: 31 };
export const SENATE_INDEPENDENTS = ["Angus King (ME)", "Bernie Sanders (VT)"];
export const SENATE_INDEPENDENTS_NOTE = `${SENATE_INDEPENDENTS.join(" and ")} are independents who caucus with Democrats; they count as Democrats here.`;
export const SENATE_SEATS = 100;
export const SENATE_TO_CONTROL = 51;
/** Breaks a 50–50 tie. */
export const VICE_PRESIDENT = { name: "JD Vance", party: "R" as Side };

/** House seats per state after the 2020 apportionment; at-large seats are district "00". */
export const HOUSE_APPORTIONMENT: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};
export const HOUSE_SEATS = 435;
export const HOUSE_TO_CONTROL = 218;

/** "PA-07", "AK-00", in state then district order; the codes the district map uses. */
export const HOUSE_DISTRICT_CODES = Object.entries(HOUSE_APPORTIONMENT).flatMap(([state, seats]) =>
  seats === 1 ? [`${state}-00`] : Array.from({ length: seats }, (_, i) => `${state}-${String(i + 1).padStart(2, "0")}`),
);
const houseCodes = new Set(HOUSE_DISTRICT_CODES);
export const isHouseDistrict = (code: string) => houseCodes.has(code);

/** "PA-07" → "PA-7", "AK-00" → "AK-AL". */
export function districtName(code: string) {
  const [state, number] = code.split("-");
  return number === "00" ? `${state}-AL` : `${state}-${Number(number)}`;
}
