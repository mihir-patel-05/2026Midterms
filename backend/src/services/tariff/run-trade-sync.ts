/**
 * One Census state imports sync under its own lease, shared by the CLI and the schedule.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { STATE_REGION } from '../fuel/fuel-catalog.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { CENSUS_TRADE_SOURCE_KEY, CensusTradeClient, syncStateImports, type TradeSyncStats } from './census-trade.js';

/** About 200 requests, four states at a time; a slow Census can take a while. */
const LEASE_MS = 60 * 60 * 1000;

export async function runTradeSync(year?: number): Promise<TradeSyncStats> {
  const token = await acquireSyncLease('census-trade', LEASE_MS);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    const client = new CensusTradeClient({ apiKey: env.CENSUS_API_KEY, baseUrl: env.CENSUS_API_BASE_URL });
    return await syncStateImports(prisma, client, Object.keys(STATE_REGION), { year });
  } finally {
    await releaseSyncLease('census-trade', token);
  }
}

/** True when the last run wrote every state and finished within `maxAgeMs`, so a restart need not ask again. */
export async function tradeSyncIsCurrent(maxAgeMs: number, now = new Date()): Promise<boolean> {
  const source = await prisma.dataSource.findUnique({ where: { key: CENSUS_TRADE_SOURCE_KEY }, select: { healthStatus: true, lastSuccessfulAt: true } });
  return source?.healthStatus === 'CURRENT' && !!source.lastSuccessfulAt && now.getTime() - source.lastSuccessfulAt.getTime() < maxAgeMs;
}
