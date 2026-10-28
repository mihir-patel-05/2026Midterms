import { PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { env } from './env.js';

export type { PollsPrismaClient };

/**
 * Client for the separate polls database (POLLS_DATABASE_URL). Null when that
 * database is not configured, so callers can answer "not configured" instead
 * of failing at import time. Created on first use, one per process.
 */
let client: PollsPrismaClient | null | undefined;

export function getPollsDb(): PollsPrismaClient | null {
  if (client !== undefined) return client;
  client = env.POLLS_DATABASE_URL
    ? new PollsPrismaClient({
        datasources: { db: { url: env.POLLS_DATABASE_URL } },
        log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      })
    : null;
  return client;
}

process.on('beforeExit', async () => {
  await client?.$disconnect();
});
