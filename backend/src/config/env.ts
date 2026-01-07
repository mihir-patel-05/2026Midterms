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
  ADMIN_PASSWORD: z.string().optional(),
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
};
