/**
 * Apify spend caps. Spend is the sum of `costUsd` in the news source's
 * ingestion_runs metadata: the last 24 hours against NEWS_DAILY_BUDGET_USD,
 * and every run against NEWS_TOTAL_BUDGET_USD. A run that would go over is
 * shrunk to fit, or skipped when too few results would be left to rank.
 *
 * Set a hard monthly usage limit in the Apify console too, as a backstop.
 */
import type { PrismaClient } from '@prisma/client';

export interface BudgetLimits {
  dailyUsd: number;
  totalUsd: number;
}

export interface Spend {
  last24hUsd: number;
  totalUsd: number;
}

export interface RunPlan {
  ok: boolean;
  maxItems: number;
  maxChargeUsd: number;
  estimateUsd: number;
  reason?: string;
}

/** Below this many results, a run cannot tell big stories from small ones. */
export const MIN_ITEMS_PER_RUN = 40;
/** Headroom for start fees and price drift. */
const ESTIMATE_MARGIN = 1.2;

export function remainingUsd(limits: BudgetLimits, spend: Spend): number {
  return Math.max(0, Math.min(limits.dailyUsd - spend.last24hUsd, limits.totalUsd - spend.totalUsd));
}

export function planRun(options: { wantedItems: number; pricePer1000Usd: number; limits: BudgetLimits; spend: Spend }): RunPlan {
  const { wantedItems, pricePer1000Usd, limits, spend } = options;
  const perItem = (pricePer1000Usd / 1000) * ESTIMATE_MARGIN;
  const remaining = remainingUsd(limits, spend);
  const affordable = perItem > 0 ? Math.floor(remaining / perItem) : wantedItems;
  const maxItems = Math.min(wantedItems, affordable);
  const round = (usd: number) => Math.round(usd * 10_000) / 10_000;
  if (maxItems < MIN_ITEMS_PER_RUN) {
    const which = limits.totalUsd - spend.totalUsd <= limits.dailyUsd - spend.last24hUsd ? 'total' : 'daily';
    return {
      ok: false,
      maxItems: 0,
      maxChargeUsd: 0,
      estimateUsd: round(wantedItems * perItem),
      reason: `The ${which} news budget has $${remaining.toFixed(2)} left, enough for ${Math.max(0, affordable)} results (minimum ${MIN_ITEMS_PER_RUN})`,
    };
  }
  const estimateUsd = round(maxItems * perItem);
  return { ok: true, maxItems, maxChargeUsd: Math.min(estimateUsd, round(remaining)), estimateUsd };
}

export async function loadSpend(db: PrismaClient, sourceId: string, now: Date = new Date()): Promise<Spend> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [row] = await db.$queryRaw<Array<{ last24h: number | null; total: number | null }>>`
    SELECT
      SUM(CASE WHEN "created_at" >= ${since} THEN ("metadata"->>'costUsd')::float8 END) AS "last24h",
      SUM(("metadata"->>'costUsd')::float8) AS "total"
    FROM "ingestion_runs"
    WHERE "source_id" = ${sourceId} AND jsonb_typeof("metadata"->'costUsd') = 'number'
  `;
  return { last24hUsd: Number(row?.last24h ?? 0), totalUsd: Number(row?.total ?? 0) };
}
