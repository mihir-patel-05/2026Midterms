import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  FEC_API_KEY: z.string(),
  GEMINI_API_KEY: z.string(),
  FEC_API_BASE_URL: z.string().default('https://api.open.fec.gov/v1'),
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FEC_API_MAX_REQUESTS_PER_HOUR: z.string().default('120'),
  ITEMIZED_COMMITTEES_PER_RUN: z.string().default('10'),
  ITEMIZED_MAX_PAGES: z.string().default('5'),
  ITEMIZED_REFRESH_HOURS: z.string().default('72'),
  ADMIN_PASSWORD: z.string().optional(),
  RESEARCHER_JWT_SECRET: z.string().default('dev-researcher-secret-change-me'),

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

export const env = {
  ...parsed.data,
  PORT: parseInt(parsed.data.PORT, 10),
  FEC_API_MAX_REQUESTS_PER_HOUR: parseInt(parsed.data.FEC_API_MAX_REQUESTS_PER_HOUR, 10),
  ITEMIZED_COMMITTEES_PER_RUN: parseInt(parsed.data.ITEMIZED_COMMITTEES_PER_RUN, 10),
  ITEMIZED_MAX_PAGES: parseInt(parsed.data.ITEMIZED_MAX_PAGES, 10),
  ITEMIZED_REFRESH_HOURS: parseInt(parsed.data.ITEMIZED_REFRESH_HOURS, 10),
  IDEOLOGY_CONGRESS: parseInt(parsed.data.IDEOLOGY_CONGRESS, 10),
};
