/** Build-time feature flags. Vite inlines these, so changing one needs a rebuild. */
const flag = (value: string | undefined) => value === "true";

export const newFrontendEnabled = flag(import.meta.env.VITE_FEATURE_NEW_FRONTEND);
export const electionDashboardEnabled = flag(import.meta.env.VITE_FEATURE_ELECTION_DASHBOARD);
export const mockResultsProviderEnabled = flag(import.meta.env.VITE_RESULTS_PROVIDER_MOCK_ENABLED);
