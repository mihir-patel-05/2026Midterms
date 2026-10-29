/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_ELECTION_DASHBOARD?: string;
  readonly VITE_RESULTS_PROVIDER_MOCK_ENABLED?: string;
  readonly VITE_FEATURE_NEW_FRONTEND?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_FEATURE_DEMOGRAPHICS?: string;
  readonly VITE_FEATURE_MARKET_HISTORY?: string;
  readonly VITE_FEATURE_MOVERS?: string;
  readonly VITE_FEATURE_PAST_RESULTS?: string;
  readonly VITE_FEATURE_SIMULATOR?: string;
  readonly VITE_FEATURE_ECONOMY?: string;
  readonly VITE_FEATURE_ODDS_MAP?: string;
  readonly VITE_FEATURE_POLLS?: string;
  readonly VITE_FEATURE_NEWS?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
