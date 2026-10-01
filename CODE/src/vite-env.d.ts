/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_ELECTION_DASHBOARD?: string;
  readonly VITE_RESULTS_PROVIDER_MOCK_ENABLED?: string;
  readonly VITE_FEATURE_NEW_FRONTEND?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
