/**
 * One Census state imports sync under its own lease, shared by the CLI and the schedule.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { STATE_REGION } from '../fuel/fuel-catalog.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { CensusTradeClient, syncStateImports, type TradeSyncStats } from './census-trade.js';

export async function runTradeSync(year?: number): Promise<TradeSyncStats> {
  const token = await acquireSyncLease('census-trade', 15 * 60 * 1000);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const client = new CensusTradeClient({ apiKey: env.CENSUS_API_KEY, baseUrl: env.CENSUS_API_BASE_URL });
    return await syncStateImports(prisma, client, Object.keys(STATE_REGION), { year });
  } finally {
    await releaseSyncLease('census-trade', token);
  }
}
