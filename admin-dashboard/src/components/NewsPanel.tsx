import { useCallback, useEffect, useState } from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import { adminAPI, type NewsStatus } from '../lib/api';

const money = (value: number | null) => (value === null ? '—' : `$${value.toFixed(2)}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : '—');

const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: 'text-emerald-400',
  PARTIAL: 'text-amber-400',
  FAILED: 'text-red-400',
  CANCELLED: 'text-slate-400',
  RUNNING: 'text-sky-400',
};

/**
 * News job status for editors: spend against the caps, recent Apify and agent runs,
 * and the latest AI picks next to the trending order they were chosen from.
 */
export function NewsPanel() {
  const [status, setStatus] = useState<NewsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await adminAPI.getNewsStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'News status is unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const picked = status?.audit.filter((row) => row.aiRank !== null).length ?? 0;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-slate-400" />
          News and top stories
        </h2>
        <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p className="px-6 py-4 text-sm text-red-400">{error}</p>}
      {status && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Spent, past 24 hours</p>
              <p className="text-white text-xl font-semibold">{money(status.budget.spentLast24hUsd)} <span className="text-slate-500 text-sm">of {money(status.budget.dailyUsd)}</span></p>
            </div>
            <div>
              <p className="text-slate-400">Spent in total</p>
              <p className="text-white text-xl font-semibold">{money(status.budget.spentTotalUsd)} <span className="text-slate-500 text-sm">of {money(status.budget.totalUsd)}</span></p>
            </div>
            <div>
              <p className="text-slate-400">Apify actor</p>
              <p className="text-white">{status.settings.actorId ?? 'Not set'}</p>
              <p className="text-slate-500 text-xs">{money(status.budget.pricePer1000Usd)} per 1,000 articles</p>
            </div>
            <div>
              <p className="text-slate-400">Switches</p>
              <p className="text-white">Ingest {status.settings.ingestEnabled ? 'on' : 'off'} · AI {status.settings.agentsEnabled ? 'on' : 'off'}</p>
              <p className="text-slate-500 text-xs">{status.settings.pickerModel}{status.settings.schedulerInProcess ? ' · in-process schedule' : ''}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">
              Trending order and AI picks
              {status.latestPicks
                ? <span className="text-slate-500 font-normal"> · picks from {when(status.latestPicks.createdAt)} by {status.latestPicks.model}, {picked} of these stories picked, {status.latestPicks.droppedIds} bad IDs and {status.latestPicks.droppedRaceKeys} bad race keys dropped</span>
                : <span className="text-slate-500 font-normal"> · no AI picks published yet</span>}
            </h3>
            <p className="text-xs text-slate-500 mb-3">Check for skew: if the picks keep favoring one party's stories while the trending list covers both, review the prompt and the exclusions.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="text-left font-medium px-3 py-2">Trend</th>
                    <th className="text-left font-medium px-3 py-2">AI</th>
                    <th className="text-left font-medium px-3 py-2">Story</th>
                    <th className="text-left font-medium px-3 py-2">Outlets</th>
                    <th className="text-left font-medium px-3 py-2">Google</th>
                    <th className="text-left font-medium px-3 py-2">Score</th>
                    <th className="text-left font-medium px-3 py-2">AI reason or exclusion</th>
                  </tr>
                </thead>
                <tbody>
                  {status.audit.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No election stories in the past 48 hours</td></tr>
                  )}
                  {status.audit.map((row) => (
                    <tr key={row.articleId} className="border-b border-slate-700/50">
                      <td className="px-3 py-2 text-slate-300">{row.trendingRank}</td>
                      <td className="px-3 py-2 text-white font-medium">{row.aiRank ?? '—'}</td>
                      <td className="px-3 py-2">
                        <a href={/^https?:\/\//i.test(row.url) ? row.url : undefined} target="_blank" rel="noopener noreferrer" className="text-white hover:underline">{row.headline}</a>
                        <span className="block text-xs text-slate-500">{row.outlet}{row.raceKeys.length ? ` · ${row.raceKeys.join(', ')}` : ''}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{row.outletCount}</td>
                      <td className="px-3 py-2 text-slate-300">{row.googlePosition ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-300">{row.score.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-300">{row.aiReason ?? (row.excludedWhy ? <span className="text-amber-400">Excluded: {row.excludedWhy}</span> : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Recent news runs</h3>
              <table className="w-full text-sm">
                <tbody>
                  {status.runs.length === 0 && <tr><td className="py-2 text-slate-500">No runs yet</td></tr>}
                  {status.runs.map((run) => (
                    <tr key={run.id} className="border-b border-slate-700/50" title={run.error ?? undefined}>
                      <td className="py-2 pr-3 text-slate-300">{when(run.startedAt)}</td>
                      <td className={`py-2 pr-3 ${STATUS_TONE[run.status] ?? 'text-slate-300'}`}>{run.status === 'CANCELLED' ? 'SKIPPED' : run.status}</td>
                      <td className="py-2 pr-3 text-slate-300">{run.fetched} fetched, {run.accepted} kept, {run.rejected} dropped</td>
                      <td className="py-2 text-slate-300">{money(run.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Recent AI runs</h3>
              <table className="w-full text-sm">
                <tbody>
                  {status.agentRuns.length === 0 && <tr><td className="py-2 text-slate-500">No AI runs yet</td></tr>}
                  {status.agentRuns.map((run) => (
                    <tr key={run.id} className="border-b border-slate-700/50" title={run.error ?? undefined}>
                      <td className="py-2 pr-3 text-slate-300">{when(run.createdAt)}</td>
                      <td className={`py-2 pr-3 ${STATUS_TONE[run.status] ?? 'text-slate-300'}`}>{run.status}</td>
                      <td className="py-2 pr-3 text-slate-300">{run.inputTokens ?? '—'} in / {run.outputTokens ?? '—'} out</td>
                      <td className="py-2 text-slate-500 truncate max-w-[16rem]">{run.error ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
