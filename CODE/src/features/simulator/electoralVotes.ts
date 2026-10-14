/**
 * Electoral votes from the 2020 census apportionment, used for the 2024 and 2028 elections.
 * 50 states plus DC; 538 in all, 270 to win.
 */
export const ELECTORAL_VOTES: Record<string, number> = {
  AL: 9, AK: 3, AZ: 11, AR: 6, CA: 54, CO: 10, CT: 7, DE: 3, DC: 3, FL: 30,
  GA: 16, HI: 4, ID: 4, IL: 19, IN: 11, IA: 6, KS: 6, KY: 8, LA: 8, ME: 4,
  MD: 10, MA: 11, MI: 15, MN: 10, MS: 6, MO: 10, MT: 4, NE: 5, NV: 6, NH: 4,
  NJ: 14, NM: 5, NY: 28, NC: 16, ND: 3, OH: 17, OK: 7, OR: 8, PA: 19, RI: 4,
  SC: 9, SD: 3, TN: 11, TX: 40, UT: 6, VT: 3, VA: 13, WA: 12, WV: 4, WI: 10,
  WY: 3,
};

export const TOTAL_ELECTORAL_VOTES = 538;
export const VOTES_TO_WIN = 270;

/**
 * Maine and Nebraska give one electoral vote to the winner of each congressional district and
 * the other two to the statewide winner.
 */
export const SPLIT_DISTRICTS: Record<string, string[]> = {
  ME: ["ME-1", "ME-2"],
  NE: ["NE-1", "NE-2", "NE-3"],
};
export const DISTRICT_CODES = Object.values(SPLIT_DISTRICTS).flat();

/**
 * Districts that voted differently from their state. There are no district-level presidential
 * returns in the data, so these are the published outcomes; every other district followed its state.
 */
export const DISTRICT_BASELINES: Record<number, Record<string, "D" | "R">> = {
  2008: { "NE-2": "D" },
  2016: { "ME-2": "R" },
  2020: { "ME-2": "R", "NE-2": "D" },
  2024: { "ME-2": "R", "NE-2": "D" },
};

/** Electoral votes decided statewide: all of them, except Maine's and Nebraska's district votes. */
export function statewideVotes(state: string) {
  return (ELECTORAL_VOTES[state] ?? 0) - (SPLIT_DISTRICTS[state]?.length ?? 0);
}

/** "ME-2" → "ME". */
export const districtState = (district: string) => district.slice(0, 2);

/** Where a baseline's county returns disagree with the certified outcome, shown under the baseline picker. */
export const BASELINE_NOTES: Record<number, string> = {
  2000: "The county returns put Gore 202 votes ahead in Florida; the certified result was Bush by 537, which decided the election.",
};
