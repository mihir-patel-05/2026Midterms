/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_ELECTION_DASHBOARD?: string;
  readonly VITE_RESULTS_PROVIDER_MOCK_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
