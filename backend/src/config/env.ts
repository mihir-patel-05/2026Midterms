import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  // The mock election dashboard must boot before external credentials exist.
  FEC_API_KEY: z.string().trim().optional(),
  GEMINI_API_KEY: z.string().trim().optional(),
  FEC_API_BASE_URL: z.string().default('https://api.open.fec.gov/v1'),
  // Address → 2026 congressional district lookup. Without a key the lookup returns 503.
  GEOCODIO_API_KEY: z.string().trim().optional(),
  GEOCODIO_API_BASE_URL: z.string().default('https://api.geocod.io/v2'),
  // Billed lookups per UTC day before lookups are refused (free tier is 2,500).
  GEOCODIO_DAILY_LOOKUP_LIMIT: z.string().regex(/^\d+$/).default('2000'),
  // Census Data API for ACS demographics (`npm run sync:acs`). The sync needs an activated key:
  // Census answers keyless requests with a "Missing Key" page. The API server boots without it.
  CENSUS_API_KEY: z.string().trim().optional(),
  CENSUS_API_BASE_URL: z.string().url().default('https://api.census.gov/data'),
  // ACS 5-year vintage to sync and serve. 2024 covers 2020-2024 and uses 119th Congress districts.
  CENSUS_ACS_YEAR: z.string().regex(/^20\d{2}$/).default('2024'),
  // FRED (St. Louis Fed) economic data. Optional: the API server boots without it.
  FRED_API_KEY: z.string().trim().optional(),
  FRED_API_BASE_URL: z.string().url().default('https://api.stlouisfed.org/fred'),
  // Economic indicators: the twice-daily FRED sync and GET /api/indicators.
  ECON_INDICATORS_ENABLED: z.enum(['true', 'false']).default('true'),
  // Serve S&P 500 and VIX, whose FRED copies bar reproduction without permission. Off until licensing is cleared.
  FRED_RESTRICTED_SERIES_ENABLED: z.enum(['true', 'false']).default('false'),
  // Schedule E (outside spending) sync: days re-fetched in full each run, and the
  // most OpenFEC pages one run may request (it shares the FEC hourly budget).
  SCHEDULE_E_WINDOW_DAYS: z.string().regex(/^[1-9]\d*$/).default('30'),
  SCHEDULE_E_MAX_PAGES: z.string().regex(/^[1-9]\d*$/).default('300'),
  // Kalshi live prices. The WebSocket needs an API key id and its RSA private key
  // (inline PEM with \n escapes, or a file path). Without them the feed stays off
  // and /api/prediction-markets falls back to public REST quotes.
  KALSHI_LIVE_ENABLED: z.enum(['true', 'false']).default('false'),
  KALSHI_API_KEY_ID: z.string().trim().optional(),
  KALSHI_PRIVATE_KEY: z.string().optional(),
  KALSHI_PRIVATE_KEY_PATH: z.string().trim().optional(),
  KALSHI_WS_URL: z.string().url().default('wss://external-api-ws.kalshi.com/trade-api/ws/v2'),
  KALSHI_REST_URL: z.string().url().default('https://external-api.kalshi.com/trade-api/v2'),
  // Hourly price history in market_snapshots, written while the live feed is connected.
  KALSHI_SNAPSHOTS_ENABLED: z.enum(['true', 'false']).default('true'),
  // Read APIs over market_snapshots: price history and biggest movers.
  MARKET_HISTORY_ENABLED: z.enum(['true', 'false']).default('true'),
  // /api/news "latest coverage" from Google News RSS search, until Apify ingestion (docs/plans/news-agents.md) replaces it.
  NEWS_RSS_ENABLED: z.enum(['true', 'false']).default('true'),
  NEWS_RSS_BASE_URL: z.string().url().default('https://news.google.com/rss/search'),
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FEC_API_MAX_REQUESTS_PER_HOUR: z.string().default('1000'),
  // After the primaries, keep only general election candidates: the scheduled FEC
  // sync deletes primary losers and stops saving them (see services/primary-pruning).
  NOMINEES_ONLY: z.enum(['true', 'false']).default('false'),
  ITEMIZED_COMMITTEES_PER_RUN: z.string().default('10'),
  ITEMIZED_MAX_PAGES: z.string().default('5'),
  ITEMIZED_REFRESH_HOURS: z.string().default('72'),
  ADMIN_PASSWORD: z.string().optional(),
  RESEARCHER_JWT_SECRET: z.string().default('dev-researcher-secret-change-me'),
  FRONTEND_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),
  // Injected by Railway as bare hosts; used as CORS fallbacks when FRONTEND_URL/ADMIN_URL are unset.
  RAILWAY_SERVICE_FRONTEND_URL: z.string().trim().optional(),
  RAILWAY_SERVICE_ADMIN_DASHBOARD_URL: z.string().trim().optional(),
  FEATURE_ELECTION_DASHBOARD: z.enum(['true', 'false']).default('false'),
  RESULTS_PROVIDER_MOCK_ENABLED: z.enum(['true', 'false']).default('false'),
  RESULTS_PROVIDER_ENABLED_IDS: z.string().default(''),
  RESULTS_STALE_AFTER_SECONDS: z.string().regex(/^[1-9]\d*$/).default('300'),
  RESULTS_POLL_INTERVAL_SECONDS: z.string().regex(/^[1-9]\d*$/).default('30'),
  RESULTS_PARSER_VERSION: z.string().default('unconfigured'),
  // Where /api/v1 results come from: published DB snapshots, or the in-memory fictional fixtures.
  RESULTS_READ_SOURCE: z.enum(['database', 'fixtures']).default('database'),

  // Ideology scoring (GovTrack-based) data sources — see src/services/ideology.service.ts
  // The Congress whose voting/cosponsorship record powers incumbent ideology scores.
  // The 119th Congress (2025-2027) is the one sitting during the 2026 midterm cycle.
  IDEOLOGY_CONGRESS: z.string().default('119'),
  // GovTrack publishes per-Congress sponsorship-analysis files (ideology + leadership
  // scores derived from cosponsorship networks) under this base path, as
  //   {BASE}/{congress}/sponsorshipanalysis_{h|s}.txt
  IDEOLOGY_GOVTRACK_BASE_URL: z
    .string()
    .default('https://www.govtrack.us/data/analysis/by-congress'),
  // The unitedstates/congress-legislators crosswalk maps FEC candidate IDs to
  // GovTrack person IDs so we can join GovTrack scores onto our FEC-keyed candidates.
  IDEOLOGY_LEGISLATORS_URL: z
    .string()
    .default(
      'https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml'
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

if (
  parsed.data.NODE_ENV === 'production' &&
  (parsed.data.RESEARCHER_JWT_SECRET === 'dev-researcher-secret-change-me' ||
    parsed.data.RESEARCHER_JWT_SECRET.length < 32)
) {
  throw new Error('RESEARCHER_JWT_SECRET must be explicitly set to at least 32 characters in production');
}

export const env = {
  ...parsed.data,
  PORT: parseInt(parsed.data.PORT, 10),
  FEC_API_MAX_REQUESTS_PER_HOUR: parseInt(parsed.data.FEC_API_MAX_REQUESTS_PER_HOUR, 10),
  ITEMIZED_COMMITTEES_PER_RUN: parseInt(parsed.data.ITEMIZED_COMMITTEES_PER_RUN, 10),
  ITEMIZED_MAX_PAGES: parseInt(parsed.data.ITEMIZED_MAX_PAGES, 10),
  ITEMIZED_REFRESH_HOURS: parseInt(parsed.data.ITEMIZED_REFRESH_HOURS, 10),
  GEOCODIO_DAILY_LOOKUP_LIMIT: parseInt(parsed.data.GEOCODIO_DAILY_LOOKUP_LIMIT, 10),
  CENSUS_ACS_YEAR: parseInt(parsed.data.CENSUS_ACS_YEAR, 10),
  SCHEDULE_E_WINDOW_DAYS: parseInt(parsed.data.SCHEDULE_E_WINDOW_DAYS, 10),
  SCHEDULE_E_MAX_PAGES: parseInt(parsed.data.SCHEDULE_E_MAX_PAGES, 10),
  IDEOLOGY_CONGRESS: parseInt(parsed.data.IDEOLOGY_CONGRESS, 10),
  KALSHI_LIVE_ENABLED: parsed.data.KALSHI_LIVE_ENABLED === 'true',
  KALSHI_SNAPSHOTS_ENABLED: parsed.data.KALSHI_SNAPSHOTS_ENABLED === 'true',
  MARKET_HISTORY_ENABLED: parsed.data.MARKET_HISTORY_ENABLED === 'true',
  ECON_INDICATORS_ENABLED: parsed.data.ECON_INDICATORS_ENABLED === 'true',
  FRED_RESTRICTED_SERIES_ENABLED: parsed.data.FRED_RESTRICTED_SERIES_ENABLED === 'true',
  NEWS_RSS_ENABLED: parsed.data.NEWS_RSS_ENABLED === 'true',
  FEATURE_ELECTION_DASHBOARD: parsed.data.FEATURE_ELECTION_DASHBOARD === 'true',
  NOMINEES_ONLY: parsed.data.NOMINEES_ONLY === 'true',
  RESULTS_PROVIDER_MOCK_ENABLED: parsed.data.RESULTS_PROVIDER_MOCK_ENABLED === 'true',
  RESULTS_PROVIDER_ENABLED_IDS: parsed.data.RESULTS_PROVIDER_ENABLED_IDS.split(',')
    .map((providerId) => providerId.trim())
    .filter(Boolean),
  RESULTS_STALE_AFTER_SECONDS: parseInt(parsed.data.RESULTS_STALE_AFTER_SECONDS, 10),
  RESULTS_POLL_INTERVAL_SECONDS: parseInt(parsed.data.RESULTS_POLL_INTERVAL_SECONDS, 10),
};
