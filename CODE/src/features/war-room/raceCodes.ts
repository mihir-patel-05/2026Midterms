import { stateMapItems } from "@/features/election-dashboard/map";
import { HOUSE_APPORTIONMENT, isHouseDistrict, isSenateRace } from "@/features/simulator/midterms/races2026";

/**
 * Race codes, as the Kalshi feed, the market-history API and the dossier URL use them:
 * `NC-SEN` for a Senate race, `PA-07` for a House seat, `DE-00` for an at-large seat.
 */

export const STATE_NAMES: Record<string, string> = Object.fromEntries(stateMapItems.map((item) => [item.code, item.name]));

export const isSenateCode = (code: string) => /^[A-Z]{2}-SEN$/.test(code) && isSenateRace(code.slice(0, 2));
export const isHouseCode = (code: string) => isHouseDistrict(code);
export const isRaceCode = (code: string) => isSenateCode(code) || isHouseCode(code);

export const raceState = (code: string) => code.slice(0, 2);
/** Two-digit district for a House code, null for a Senate one. */
export const raceDistrict = (code: string) => (isHouseCode(code) ? code.slice(3) : null);

/** "PA-07", "DE-AL" or "NC-SEN", for display. */
export function raceLabel(code: string) {
  return code.endsWith("-00") ? `${code.slice(0, 2)}-AL` : code;
}

/** "North Carolina · U.S. Senate", "Pennsylvania · District 7", "Delaware · At-large". */
export function raceTitle(code: string) {
  const state = STATE_NAMES[raceState(code)] ?? raceState(code);
  const district = raceDistrict(code);
  if (!district) return `${state} · U.S. Senate`;
  return `${state} · ${district === "00" ? "At-large" : `District ${Number(district)}`}`;
}

/** The race a map selection points at: the district on the districts layer, else the state's Senate race. */
export function raceForSelection(state: string | null, district: string | null, house: boolean): string | null {
  if (!state) return null;
  if (house) {
    if (!district) return null;
    const code = `${state}-${district}`;
    return isHouseCode(code) ? code : null;
  }
  return isSenateRace(state) ? `${state}-SEN` : null;
}

/** A race, a state with no Senate race (`code` null), or why the text names neither. */
export type ParsedRace = { code: string | null; state: string } | { error: string };

/**
 * What someone typed in the search or watchlist box: "nc-sen", "NC Senate", "PA 8", "pa-08",
 * "AK-AL", "Ohio" or "Ohio Senate". A state on its own gives its Senate race when there is one,
 * otherwise just the state.
 */
export function parseRace(text: string): ParsedRace {
  const t = text.trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return { error: "Type a race, like ME-SEN, PA-08 or Ohio." };
  const byName = Object.keys(STATE_NAMES).find((code) => STATE_NAMES[code].toUpperCase() === t);
  const bare = byName ?? (STATE_NAMES[t] ? t : null);
  if (bare) return isSenateRace(bare) ? { code: `${bare}-SEN`, state: bare } : { code: null, state: bare };

  const named = Object.keys(STATE_NAMES).find((code) => t.startsWith(`${STATE_NAMES[code].toUpperCase()} `));
  const rest = named ? `${named} ${t.slice(STATE_NAMES[named].length + 1)}` : t;
  const match = /^([A-Z]{2})[\s-]*(SEN|SENATE|AL|\d{1,2})$/.exec(rest);
  if (!match || !STATE_NAMES[match[1]]) return { error: `No race matches "${text.trim()}".` };
  const [, state, part] = match;
  const name = STATE_NAMES[state];
  if (part === "SEN" || part === "SENATE") {
    return isSenateRace(state) ? { code: `${state}-SEN`, state } : { error: `No Senate race in ${name} this year.` };
  }
  const code = `${state}-${part === "AL" ? "00" : part.padStart(2, "0")}`;
  if (isHouseCode(code)) return { code, state };
  const seats = HOUSE_APPORTIONMENT[state];
  return { error: seats === 1 ? `${name} has one at-large seat: ${state}-AL.` : `${name} has ${seats} districts.` };
}

/** A race code from a URL segment, accepting "pa-7" and "AK-AL" as well; null when it names no 2026 race. */
export function normaliseRaceCode(segment: string | undefined): string | null {
  if (!segment?.includes("-")) return null;
  const parsed = parseRace(segment.replace(/-/g, " "));
  return "code" in parsed ? parsed.code : null;
}
