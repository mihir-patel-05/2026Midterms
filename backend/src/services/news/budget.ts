/**
 * Spend caps for the Apify news runs.
 *
 * Each run records what it cost in ingestion_runs.metadata.costUsd: the larger of the
 * cost Apify reports for the run and the article count times the configured price, so
 * a run is never counted as cheaper than its articles. Before a run, the smaller of the
 * rolling 24-hour budget left and the total budget left sets how many articles the run
 * may return and the most Apify may charge for it.
 */
import type { PrismaClient } from '@prisma/client';

export interface BudgetLimits {
  dailyUsd: number;
  totalUsd: number;
  pricePer1000Usd: number;
  maxItemsPerRun: number;
}

export interface Spend {
  last24hUsd: number;
  totalUsd: number;
}

export type BudgetDecision =
  | { ok: true; maxItems: number; maxChargeUsd: number; remainingUsd: number }
  | { ok: false; reason: string; remainingUsd: number };

/** A run that can't return this many articles is not worth its start fee. */
export const MIN_ITEMS_PER_RUN = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const dollars = (value: number) => `$${value.toFixed(2)}`;

export function planRunBudget(limits: BudgetLimits, spend: Spend): BudgetDecision {
  const dailyLeft = limits.dailyUsd - spend.last24hUsd;
  const totalLeft = limits.totalUsd - spend.totalUsd;
  const remainingUsd = Math.max(0, Math.min(dailyLeft, totalLeft));
  if (totalLeft <= 0) return { ok: false, reason: `The total news budget of ${dollars(limits.totalUsd)} is spent`, remainingUsd };
  if (dailyLeft <= 0) return { ok: false, reason: `The 24-hour news budget of ${dollars(limits.dailyUsd)} is spent`, remainingUsd };
  const affordable = Math.floor((remainingUsd * 1000) / limits.pricePer1000Usd);
  const maxItems = Math.min(limits.maxItemsPerRun, affordable);
  if (maxItems < MIN_ITEMS_PER_RUN) {
    return { ok: false, reason: `${dollars(remainingUsd)} of budget left covers fewer than ${MIN_ITEMS_PER_RUN} articles`, remainingUsd };
  }
  return { ok: true, maxItems, maxChargeUsd: Math.floor(remainingUsd * 100) / 100, remainingUsd };
}

/** What a run cost: Apify's figure, or the article count times the price if that is higher. */
export function runCostUsd(items: number, pricePer1000Usd: number, reportedUsd: number | null): number {
  const estimate = (items * pricePer1000Usd) / 1000;
  return Math.round(Math.max(estimate, reportedUsd ?? 0) * 10_000) / 10_000;
}

function costOf(metadata: unknown): number {
  const value = (metadata as { costUsd?: unknown } | null)?.costUsd;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Spend recorded on this source's runs: the past 24 hours, and all time. */
export async function loadSpend(db: PrismaClient, sourceKey: string, now: Date): Promise<Spend> {
  const runs = await db.ingestionRun.findMany({
    where: { source: { key: sourceKey } },
    select: { startedAt: true, createdAt: true, metadata: true },
  });
  const since = now.getTime() - DAY_MS;
  let last24hUsd = 0;
  let totalUsd = 0;
  for (const run of runs) {
    const cost = costOf(run.metadata);
    totalUsd += cost;
    if ((run.startedAt ?? run.createdAt).getTime() >= since) last24hUsd += cost;
  }
  return { last24hUsd, totalUsd };
}
