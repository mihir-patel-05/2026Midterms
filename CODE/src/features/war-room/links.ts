import { raceDistrict } from "./raceCodes";

/** Selection parameters that belong to one state; targeting another race clears them. */
const SELECTION_KEYS = ["district", "districts", "counties", "contest", "lat", "lon", "zoom"];

/**
 * The query string that targets a race, or a state with no Senate race, on the Command map. It writes the same
 * parameters as the monitor's market-odds mode (`mode=odds`, `ooffice`, `layer`, `state`, `district`), so the link
 * works on `/` too, and keeps every unrelated parameter.
 */
export function targetSearch(search: string, state: string, code: string | null) {
  const next = new URLSearchParams(search);
  for (const key of SELECTION_KEYS) next.delete(key);
  next.set("state", state);
  next.set("mode", "odds");
  const district = code ? raceDistrict(code) : null;
  if (district) {
    next.set("district", district);
    next.set("layer", "districts");
    next.set("ooffice", "house");
  } else {
    // "states" and "senate" are the defaults, left out so links stay short.
    next.delete("layer");
    next.delete("ooffice");
  }
  return withQuery(next);
}

/** "?a=1", or "" for no parameters. */
export function withQuery(params: URLSearchParams) {
  const text = params.toString();
  return text ? `?${text}` : "";
}
