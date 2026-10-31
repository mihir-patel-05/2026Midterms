/**
 * One EIA fuel price sync under its own lease, shared by the CLI and the schedule.
 */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { acquireSyncLease, releaseSyncLease, SyncAlreadyRunningError } from '../sync-lock.service.js';
import { EiaClient } from './eia-client.js';
import { syncFuel, type FuelSyncStats } from './fuel-sync.js';

export const FUEL_LEASE = 'eia-fuel';

export async function runFuelSync(): Promise<FuelSyncStats> {
  if (!env.EIA_API_KEY) throw new Error('EIA_API_KEY is not configured; get a free key at https://www.eia.gov/opendata/register.php');
  const token = await acquireSyncLease(FUEL_LEASE, 15 * 60 * 1000);
  if (!token) throw new SyncAlreadyRunningError();
  try {
    return await syncFuel(prisma, new EiaClient({ apiKey: env.EIA_API_KEY, baseUrl: env.EIA_API_BASE_URL }));
  } finally {
    await releaseSyncLease(FUEL_LEASE, token);
  }
}
