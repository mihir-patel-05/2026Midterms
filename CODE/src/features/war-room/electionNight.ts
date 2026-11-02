import { FIRST_POLLS_CLOSE } from "./countdown";

/**
 * Election night windows, in UTC milliseconds. The first polls close at 18:00 ET on Nov 3 (`FIRST_POLLS_CLOSE`).
 * Counting goes on for days, but the night itself (the War Room opening on the Night screen) ends at 06:00 ET on
 * Nov 5, and the site-wide link to it stops calling results "live" at 00:00 ET on Nov 7.
 */
export const NIGHT_STARTS = FIRST_POLLS_CLOSE;
export const NIGHT_ENDS = Date.parse("2026-11-05T11:00:00Z");
export const LIVE_LINK_ENDS = Date.parse("2026-11-07T05:00:00Z");

/** True from the first poll close until the morning of Nov 5. */
export const isElectionNight = (now: number) => now >= NIGHT_STARTS && now < NIGHT_ENDS;

/** True from the first poll close until Nov 7, while results are still coming in. */
export const resultsAreLive = (now: number) => now >= NIGHT_STARTS && now < LIVE_LINK_ENDS;

const REDIRECT_KEY = "warRoom.nightRedirected";

/**
 * Whether a visit that opens the War Room's Command screen should go to the Night screen instead: only on election
 * night, only when the page was opened directly (not by clicking Command inside the War Room), and once per tab, so
 * someone who goes back to Command and reloads stays there.
 */
export function shouldOpenNight(now: number, openedDirectly: boolean, storage: Pick<Storage, "getItem" | "setItem"> | null) {
  if (!openedDirectly || !isElectionNight(now)) return false;
  try {
    if (storage?.getItem(REDIRECT_KEY)) return false;
    storage?.setItem(REDIRECT_KEY, "1");
  } catch {
    // Storage blocked: redirect anyway; the in-app Command link still reaches Command.
  }
  return true;
}
