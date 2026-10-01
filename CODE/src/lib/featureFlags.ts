/** Build-time feature flags. Vite inlines these, so changing one needs a rebuild. */
const flag = (value: string | undefined) => value === "true";

/** On by default; set VITE_FEATURE_NEW_FRONTEND=false at build time to roll back to the legacy frontend. */
export const newFrontendEnabled = import.meta.env.VITE_FEATURE_NEW_FRONTEND !== "false";
export const electionDashboardEnabled = flag(import.meta.env.VITE_FEATURE_ELECTION_DASHBOARD);
export const mockResultsProviderEnabled = flag(import.meta.env.VITE_RESULTS_PROVIDER_MOCK_ENABLED);
