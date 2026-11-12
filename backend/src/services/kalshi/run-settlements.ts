/** One settlement read with the environment's settings, under a lease so two replicas never overlap (#136). */
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { acquireSyncLease, releaseSyncLease } from '../sync-lock.service.js';
import { getJson } from './live-feed.js';
import { syncSettlements, type SettlementReport } from './settlements.js';

const LEASE = 'kalshi-settlements';

export async function runSettlementSync(): Promise<SettlementReport | null> {
  const token = await acquireSyncLease(LEASE, 30 * 60_000, prisma);
  if (!token) return null;
  try {
    const report = await syncSettlements(prisma, env.KALSHI_REST_URL, getJson);
    const failed = report.failedEvents.length > 0 ? `, ${report.failedEvents.length} events failed (first: ${report.failedEvents[0]})` : '';
    const unreadable = report.unreadable > 0 ? `, ${report.unreadable} settled with no readable result` : '';
    console.log(`🏁 Kalshi settlements: ${report.settled} of ${report.markets} markets settled (${report.newlySettled} new), ${report.open} not settled yet${unreadable}${failed}`);
    return report;
  } finally {
    await releaseSyncLease(LEASE, token, prisma).catch(() => {});
  }
}
