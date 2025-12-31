import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Vote,
  Building2,
  MapPin,
  RefreshCw,
  Database,
  LogOut,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { adminAPI, AdminStats, SyncStatus, SyncLog } from '../lib/api';

interface DashboardProps {
  onLogout: () => void;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    running: 'bg-yellow-500/20 text-yellow-400',
    started: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const icons: Record<string, React.ElementType> = {
    completed: CheckCircle,
    running: Loader2,
    started: Clock,
    failed: XCircle,
  };

  const Icon = icons[status] || Clock;
  const colorClass = colors[status] || 'bg-slate-500/20 text-slate-400';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsData, statusData] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getSyncStatus(),
      ]);
      setStats(statsData);
      setSyncStatus(statusData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Poll for updates when a sync is running
    const interval = setInterval(() => {
      if (syncStatus?.isRunning) {
        loadData();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loadData, syncStatus?.isRunning]);

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);

    try {
      const result = await adminAPI.triggerSync();
      setMessage({ type: 'success', text: `Sync started! ID: ${result.syncId}` });
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start sync';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateElections = async () => {
    setIsGenerating(true);
    setMessage(null);

    try {
      const result = await adminAPI.generateElections();
      setMessage({
        type: 'success',
        text: `Generated ${result.electionsCreated} elections with ${result.candidateLinksCreated} candidate links`,
      });
      loadData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate elections';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-slate-400">2026 Midterms Data Management</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message */}
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            {message.text}
          </div>
        )}

        {/* Stats Grid */}
        {isLoadingStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-24 mb-3"></div>
                <div className="h-8 bg-slate-700 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard title="Total Candidates" value={stats.candidates} icon={Users} color="bg-blue-600" />
            <StatCard title="Total Elections" value={stats.elections} icon={Vote} color="bg-green-600" />
            <StatCard title="Committees" value={stats.committees} icon={Building2} color="bg-purple-600" />
            <StatCard title="States with Data" value={stats.statesWithCandidates} icon={MapPin} color="bg-orange-600" />
          </div>
        ) : null}

        {/* Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Sync Card */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              FEC Data Sync
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Sync candidate and financial data from the FEC API for all 50 states.
              This process may take 15-30 minutes.
            </p>
            {stats?.lastSync && (
              <p className="text-slate-500 text-sm mb-4">
                Last sync: {formatDate(stats.lastSync.completedAt)} ({formatDuration(stats.lastSync.duration)})
              </p>
            )}
            <button
              onClick={handleSync}
              disabled={isSyncing || syncStatus?.isRunning}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSyncing || syncStatus?.isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {syncStatus?.isRunning ? 'Sync in Progress...' : 'Starting...'}
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Sync FEC Data
                </>
              )}
            </button>
          </div>

          {/* Generate Elections Card */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Vote className="w-5 h-5 text-green-400" />
              Generate Elections
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Create election records from existing candidate data and link candidates
              to their respective races.
            </p>
            <p className="text-slate-500 text-sm mb-4">
              Current elections: {stats?.elections.toLocaleString() || 0}
            </p>
            <button
              onClick={handleGenerateElections}
              disabled={isGenerating}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Vote className="w-5 h-5" />
                  Generate Elections
                </>
              )}
            </button>
          </div>
        </div>

        {/* Recent Sync Logs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              Recent Sync History
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Type</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Status</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Started</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Duration</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Records</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Errors</th>
                </tr>
              </thead>
              <tbody>
                {syncStatus?.recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No sync history available
                    </td>
                  </tr>
                ) : (
                  syncStatus?.recentLogs.map((log: SyncLog) => (
                    <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-6 py-4 text-white font-medium capitalize">{log.type}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">{formatDate(log.startedAt)}</td>
                      <td className="px-6 py-4 text-slate-300 text-sm">{formatDuration(log.duration)}</td>
                      <td className="px-6 py-4 text-slate-300">{log.recordsProcessed.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={log.recordsErrors > 0 ? 'text-red-400' : 'text-slate-500'}>
                          {log.recordsErrors}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

