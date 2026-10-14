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
