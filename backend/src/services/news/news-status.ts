/**
 * The admin dashboard's view of the news job: spend against the caps, recent runs, and
 * an audit of the latest AI picks next to the trending order they were chosen from, so
 * an editor can check for skew (docs/plans/news-agents.md).
 */
import type { PrismaClient } from '@prisma/client';
import { loadSpend, type BudgetLimits } from './budget.js';
import { loadTrending } from './news-read.js';
import { NEWS_SOURCE_KEY } from './news-sync.js';
import { latestPublishedTopStories, PICKER_CANDIDATES, type TopStoriesPayload } from './top-stories-agent.js';

export interface NewsStatus {
  settings: { ingestEnabled: boolean; agentsEnabled: boolean; schedulerInProcess: boolean; actorId: string | null; pickerModel: string };
  budget: BudgetLimits & { spentLast24hUsd: number; spentTotalUsd: number };
  runs: Array<{ id: string; startedAt: string | null; status: string; fetched: number; accepted: number; rejected: number; costUsd: number | null; error: string | null }>;
  agentRuns: Array<{ id: string; createdAt: string; status: string; model: string; inputTokens: number | null; outputTokens: number | null; error: string | null }>;
  latestPicks: { createdAt: string; model: string; droppedIds: number; droppedRaceKeys: number } | null;
  /** The trending order now, with what the latest picks did with each story. */
  audit: Array<{
    trendingRank: number;
    articleId: string;
    headline: string;
    outlet: string;
    url: string;
    outletCount: number;
    googlePosition: number | null;
    score: number;
    aiRank: number | null;
    aiReason: string | null;
    raceKeys: string[];
    excludedWhy: string | null;
  }>;
}

export async function getNewsStatus(
  db: PrismaClient,
  options: { settings: NewsStatus['settings']; limits: BudgetLimits; now?: Date; sourceKey?: string },
): Promise<NewsStatus> {
  const { settings, limits, now = new Date(), sourceKey = NEWS_SOURCE_KEY } = options;
  const [spend, runs, agentRuns, latest, trending] = await Promise.all([
    loadSpend(db, sourceKey, now),
    db.ingestionRun.findMany({ where: { source: { key: sourceKey } }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.agentRun.findMany({ where: { agent: 'TOP_STORIES' }, orderBy: { createdAt: 'desc' }, take: 8 }),
    latestPublishedTopStories(db),
    loadTrending(db, sourceKey, now),
  ]);
  const payload = latest?.payload as TopStoriesPayload | undefined;
  const picked = new Map((payload?.picks ?? []).map((pick) => [pick.articleId, pick]));
  const excluded = new Map((payload?.excluded ?? []).map((entry) => [entry.articleId, entry.why]));
  return {
    settings,
    budget: { ...limits, spentLast24hUsd: round(spend.last24hUsd), spentTotalUsd: round(spend.totalUsd) },
    runs: runs.map((run) => {
      const metadata = (run.metadata ?? {}) as { costUsd?: unknown };
      return {
        id: run.id,
        startedAt: run.startedAt?.toISOString() ?? null,
        status: run.status,
        fetched: run.recordsFetched,
        accepted: run.recordsAccepted,
        rejected: run.recordsRejected,
        costUsd: typeof metadata.costUsd === 'number' ? metadata.costUsd : null,
        error: run.errorSummary,
      };
    }),
    agentRuns: agentRuns.map((run) => ({
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      status: run.status,
      model: run.model,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      error: run.error,
    })),
    latestPicks: latest && payload
      ? { createdAt: latest.createdAt.toISOString(), model: payload.model, droppedIds: payload.droppedIds, droppedRaceKeys: payload.droppedRaceKeys }
      : null,
    audit: trending.slice(0, PICKER_CANDIDATES).map((story, index) => {
      const pick = picked.get(story.lead.id);
      return {
        trendingRank: index + 1,
        articleId: story.lead.id,
        headline: story.lead.headline,
        outlet: story.lead.outlet,
        url: story.lead.url,
        outletCount: story.outletCount,
        googlePosition: story.bestPosition,
        score: story.score,
        aiRank: pick?.rank ?? null,
        aiReason: pick?.reason ?? null,
        raceKeys: pick?.raceKeys ?? [],
        excludedWhy: excluded.get(story.lead.id) ?? null,
      };
    }),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
