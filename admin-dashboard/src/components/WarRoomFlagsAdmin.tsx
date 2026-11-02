import { useCallback, useEffect, useState } from 'react';
import { Loader2, ToggleRight } from 'lucide-react';
import { warRoomFlagsAPI, type WarRoomFlagRow } from '../lib/api';

/**
 * Election night: turn the War Room's extras on or off without a deploy. The site picks a change up within about
 * a minute and a half (30 seconds of API cache, then each browser's next one-minute refresh).
 */
export function WarRoomFlagsAdmin() {
  const [flags, setFlags] = useState<WarRoomFlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setFlags((await warRoomFlagsAPI.list()).flags);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load the War Room switches' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (flag: WarRoomFlagRow, enabled: boolean) => {
    setBusy(flag.name);
    setMessage(null);
    try {
      await warRoomFlagsAPI.set(flag.name, enabled);
      setMessage({ type: 'success', text: `${flag.label}: ${enabled ? 'on' : 'off'}` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ToggleRight className="w-5 h-5 text-amber-400" />
          War Room switches · election night
        </h2>
      </div>
      <p className="px-6 pt-4 text-sm text-slate-400">
        Each extra is on unless switched off here. Changes reach the site within about a minute and a half, with no deploy.
      </p>
      {message && (
        <p className={`mx-6 mt-3 rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>{message.text}</p>
      )}
      {loading ? (
        <div className="p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></div>
      ) : (
        <ul className="px-6 py-4 grid gap-3 sm:grid-cols-2">
          {flags.map((flag) => (
            <li key={flag.name}>
              <label className="flex items-center gap-3 text-sm text-slate-200">
                <input type="checkbox" checked={flag.enabled} disabled={busy === flag.name} onChange={(event) => void toggle(flag, event.target.checked)} />
                <span>{flag.label} <code className="text-xs text-slate-500">{flag.name}</code></span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
