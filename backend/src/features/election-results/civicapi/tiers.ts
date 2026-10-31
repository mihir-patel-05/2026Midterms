/**
 * Which races get county detail (tier A) on election night (docs/plans/civicapi-results.md,
 * "Tiers and cadence"). Tier A races take their snapshots from `/race/{id}`, with counties; every
 * other race takes them from the two aggregates. Chosen once when the ingestor starts, so no race
 * switches document kinds mid-night (each kind has its own `last_updated`, and publishing rejects
 * an older snapshot).
 */
import type { PrismaClient } from '@prisma/client';

/** Same line as news tier A: a Kalshi leader under 80¢ is a race to watch. */
export const TIER_A_LEADER_BELOW = 0.8;

export interface TierChoice {
  /** `PA-07`, `GA-SEN`, closest first. */
  labels: string[];
  reason: string;
}

/** `PA-7`, `pa-07`, `ga-sen` → `PA-07`, `GA-SEN`. */
export function normalizeLabel(value: string): string | null {
  const match = /^([A-Za-z]{2})-(SEN|\d{1,2}|AL)$/i.exec(value.trim());
  if (!match) return null;
  const state = match[1].toUpperCase();
  const seat = match[2].toUpperCase();
  return seat === 'SEN' ? `${state}-SEN` : `${state}-${seat === 'AL' ? '00' : seat.padStart(2, '0')}`;
}

/**
 * Races from the latest hour of Kalshi snapshots whose leader is under 80¢, closest first, capped.
 * An explicit list (`CIVICAPI_TIER_A_RACES`) replaces the choice.
 */
export async function chooseTierA(db: PrismaClient, options: { max: number; override: string[] }): Promise<TierChoice> {
  if (options.override.length > 0) {
    const labels = [...new Set(options.override.map(normalizeLabel).filter((label): label is string => Boolean(label)))].slice(0, options.max);
    return { labels, reason: 'CIVICAPI_TIER_A_RACES' };
  }
  const latest = await db.marketSnapshot.findFirst({
    where: { provider: 'KALSHI', scope: { in: ['STATE_SENATE', 'HOUSE_DISTRICT'] } },
    orderBy: { capturedHour: 'desc' },
    select: { capturedHour: true },
  });
  if (!latest) return { labels: [], reason: 'no Kalshi snapshots stored, so no race has county detail' };
  const rows = await db.marketSnapshot.findMany({
    where: { provider: 'KALSHI', scope: { in: ['STATE_SENATE', 'HOUSE_DISTRICT'] }, capturedHour: latest.capturedHour },
    select: { scope: true, stateCode: true, districtCode: true, price: true },
  });
  const leader = new Map<string, number>();
  for (const row of rows) {
    if (!row.stateCode) continue;
    const label = row.scope === 'STATE_SENATE' ? `${row.stateCode}-SEN` : `${row.stateCode}-${row.districtCode}`;
    leader.set(label, Math.max(leader.get(label) ?? 0, row.price.toNumber()));
  }
  const labels = [...leader]
    .filter(([, price]) => price < TIER_A_LEADER_BELOW)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, options.max)
    .map(([label]) => label);
  return { labels, reason: `Kalshi leader under ${Math.round(TIER_A_LEADER_BELOW * 100)}¢ at ${latest.capturedHour.toISOString()}` };
}
