/** Build-time feature flags. Vite inlines these, so changing one needs a rebuild. */
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
/** News tab in the war room's detail panel (latest coverage from /api/news). On unless set to "false". */
export const newsEnabled = import.meta.env.VITE_FEATURE_NEWS !== "false";
