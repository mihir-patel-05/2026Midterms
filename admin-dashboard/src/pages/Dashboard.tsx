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
  Calendar,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react';
import { adminAPI, AdminStats, SyncStatus, SyncLog, Deadline, DeadlineInput } from '../lib/api';

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

function formatDeadlineDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Deadline Modal Component
function DeadlineModal({
  isOpen,
  onClose,
  onSave,
  deadline,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: DeadlineInput) => void;
  deadline: Deadline | null;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'registration' | 'election' | 'other'>('registration');
  const [states, setStates] = useState('');
  const [description, setDescription] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (deadline) {
      setTitle(deadline.title);
      setDate(new Date(deadline.date).toISOString().split('T')[0]);
      setType(deadline.type);
      setStates(deadline.states.join(', '));
      setDescription(deadline.description || '');
      setUrgent(deadline.urgent);
      setIsActive(deadline.isActive);
    } else {
      setTitle('');
      setDate('');
      setType('registration');
      setStates('');
      setDescription('');
      setUrgent(false);
      setIsActive(true);
    }
  }, [deadline, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const statesArray = states.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    onSave({
      title,
      date: new Date(date).toISOString(),
      type,
      states: statesArray,
      description: description || undefined,
      urgent,
      isActive,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {deadline ? 'Edit Deadline' : 'Add Deadline'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., Primary Registration Deadline"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Type *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'registration' | 'election' | 'other')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="registration">Registration</option>
              <option value="election">Election</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">States *</label>
            <input
              type="text"
              value={states}
              onChange={(e) => setStates(e.target.value)}
              required
              placeholder="e.g., CA, TX, NY or ALL"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated state codes, or "ALL" for all states</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-300">Mark as urgent</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                deadline ? 'Update' : 'Create'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingDeadlines, setIsLoadingDeadlines] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);

  // Auto-dismiss toast messages after 5 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

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

  const loadDeadlines = useCallback(async () => {
    try {
      const response = await adminAPI.getDeadlines();
      setDeadlines(response.deadlines);
    } catch (error) {
      console.error('Failed to load deadlines:', error);
    } finally {
      setIsLoadingDeadlines(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadDeadlines();
  }, [loadData, loadDeadlines]);

  // Separate effect for polling during sync — avoids infinite re-render loop
  useEffect(() => {
    if (!syncStatus?.isRunning) return;

    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [syncStatus?.isRunning, loadData]);

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

  const handleSaveDeadline = async (data: DeadlineInput) => {
    setIsSavingDeadline(true);
    setMessage(null);

    try {
      if (editingDeadline) {
        await adminAPI.updateDeadline(editingDeadline.id, data);
        setMessage({ type: 'success', text: 'Deadline updated successfully' });
      } else {
        await adminAPI.createDeadline(data);
        setMessage({ type: 'success', text: 'Deadline created successfully' });
      }
      setIsModalOpen(false);
      setEditingDeadline(null);
      loadDeadlines();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save deadline';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsSavingDeadline(false);
    }
  };

  const handleDeleteDeadline = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deadline?')) return;

    setMessage(null);
    try {
      await adminAPI.deleteDeadline(id);
      setMessage({ type: 'success', text: 'Deadline deleted successfully' });
      loadDeadlines();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete deadline';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const openAddModal = () => {
    setEditingDeadline(null);
    setIsModalOpen(true);
  };

  const openEditModal = (deadline: Deadline) => {
    setEditingDeadline(deadline);
    setIsModalOpen(true);
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

        {/* Deadlines Management */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" />
              Upcoming Deadlines
            </h2>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Deadline
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Title</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Date</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Type</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">States</th>
                  <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Status</th>
                  <th className="text-right text-sm font-medium text-slate-400 px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingDeadlines ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                    </td>
                  </tr>
                ) : deadlines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No deadlines yet. Click "Add Deadline" to create one.
                    </td>
                  </tr>
                ) : (
                  deadlines.map((deadline) => (
                    <tr key={deadline.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{deadline.title}</span>
                          {deadline.urgent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                              <AlertCircle className="w-3 h-3" />
                              Urgent
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">
                        {formatDeadlineDate(deadline.date)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          deadline.type === 'election' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : deadline.type === 'registration'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {deadline.type.charAt(0).toUpperCase() + deadline.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-300 text-sm">
                        {deadline.states.length > 3 
                          ? `${deadline.states.slice(0, 3).join(', ')} +${deadline.states.length - 3} more`
                          : deadline.states.join(', ')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          deadline.isActive
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {deadline.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(deadline)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDeadline(deadline.id)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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

      {/* Deadline Modal */}
      <DeadlineModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDeadline(null);
        }}
        onSave={handleSaveDeadline}
        deadline={editingDeadline}
        isSaving={isSavingDeadline}
      />
    </div>
  );
}
