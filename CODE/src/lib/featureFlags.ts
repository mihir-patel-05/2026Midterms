/**
 * Build-time feature flags. Vite inlines these, so changing one needs a rebuild.
 * A new VITE_* name also needs an `ARG` line in CODE/Dockerfile, or the Railway
 * value never reaches the build; `npm run check:build-args` catches a missing one.
 */
const flag = (value: string | undefined) => value === "true";

/** On by default; set VITE_FEATURE_NEW_FRONTEND=false at build time to roll back to the legacy frontend. */
export const newFrontendEnabled = import.meta.env.VITE_FEATURE_NEW_FRONTEND !== "false";
export const electionDashboardEnabled = flag(import.meta.env.VITE_FEATURE_ELECTION_DASHBOARD);
export const mockResultsProviderEnabled = flag(import.meta.env.VITE_RESULTS_PROVIDER_MOCK_ENABLED);
/** Demographics tab on the monitor. On unless set to "false"; it shows a notice until the ACS sync has run. */
export const demographicsEnabled = import.meta.env.VITE_FEATURE_DEMOGRAPHICS !== "false";
/** Hourly Kalshi price sparklines on race cards and the markets panel. On unless set to "false". */
export const marketHistoryEnabled = import.meta.env.VITE_FEATURE_MARKET_HISTORY !== "false";
/** Biggest movers card (Kalshi price changes over 24 hours or 7 days). On unless set to "false". */
export const moversEnabled = import.meta.env.VITE_FEATURE_MOVERS !== "false";
/** FRED economic indicators strip under the chamber-control odds. On unless set to "false"; hidden until the backend's FRED sync has run. */
export const economyEnabled = import.meta.env.VITE_FEATURE_ECONOMY !== "false";
/** Past results map mode (MIT Election Lab returns). On unless set to "false". */
export const pastResultsEnabled = import.meta.env.VITE_FEATURE_PAST_RESULTS !== "false";
/** Electoral college and county simulator at /simulator. On unless set to "false"; it runs on the Past results files, so it needs that flag too. */
export const simulatorEnabled = pastResultsEnabled && import.meta.env.VITE_FEATURE_SIMULATOR !== "false";
/** Market odds map mode (each Senate state or House district coloured by its Kalshi market). On unless set to "false". */
export const oddsMapEnabled = import.meta.env.VITE_FEATURE_ODDS_MAP !== "false";
/** Polls and polling averages (VoteHub) on race pages and the monitor's Polls tab. On unless set to "false"; shows a notice until the backend's polls database is connected and synced. */
export const pollsEnabled = import.meta.env.VITE_FEATURE_POLLS !== "false";
/** National environment card in the midterm simulator: presidential approval, the generic ballot, and the swings they imply (VoteHub). On unless set to "false"; needs no polls database. */
export const nationalPollsEnabled = import.meta.env.VITE_FEATURE_NATIONAL_POLLS !== "false";
/** Top political stories of the past 24 hours: the /news page and the monitor's Top stories card. Off unless set to "true"; needs NEWS_ENABLED on the backend. */
export const newsEnabled = flag(import.meta.env.VITE_FEATURE_NEWS);
/**
 * The War Room dashboard at /war-room. Off unless set to "true", unlike the flags above: the current monitor is what
 * voters use on election night, so the War Room stays out of production builds (and its code is never downloaded)
 * until the cut-over. See docs/plans/war-room-frontend.md.
 */
export const warRoomEnabled = import.meta.env.VITE_FEATURE_WAR_ROOM === "true";
