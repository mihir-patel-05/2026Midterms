import { useCallback, useEffect, useState } from 'react';
import { Loader2, Tv } from 'lucide-react';
import { liveStreamsAPI, type LiveStreamRow } from '../lib/api';

/**
 * Election night: set each outlet's YouTube stream for the War Room's Live coverage panel, without a deploy.
 * Paste the live video link (or a youtube.com/channel/UC… link to follow the channel's current stream).
 * Outlets stay alphabetical on the site and are treated the same.
 */
export function LiveCoverageAdmin() {
  const [streams, setStreams] = useState<LiveStreamRow[]>([]);
  const [shown, setShown] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await liveStreamsAPI.list();
      setStreams(data.streams);
      setShown(data.shown);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load live coverage' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'success', text: done });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Tv className="w-5 h-5 text-amber-400" />
          Live coverage · election night streams
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={shown} disabled={busy === 'panel'}
            onChange={(event) => run('panel', () => liveStreamsAPI.setPanel(event.target.checked), event.target.checked ? 'Live coverage panel shown' : 'Live coverage panel hidden')} />
          Show the panel in the War Room
        </label>
      </div>
      <p className="px-6 pt-4 text-sm text-slate-400">
        Paste each outlet's election-night YouTube link (watch, youtu.be, or /live/ link), or a channel link
        (youtube.com/channel/UC…) to show whatever that channel is streaming. Leave it empty for a link-out tile.
        The site picks changes up within two minutes. Calls in a broadcast are the network's; never copy them into results.
      </p>
      {message && (
        <p className={`mx-6 mt-3 rounded-lg px-3 py-2 text-sm ${message.type === 'success' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>{message.text}</p>
      )}
      {loading ? (
        <div className="p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Outlet</th>
                <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Now playing</th>
                <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">Set stream</th>
                <th className="text-left text-sm font-medium text-slate-400 px-6 py-3">On site</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => (
                <tr key={stream.key} className="border-b border-slate-700/50 align-top">
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{stream.name}</div>
                    {stream.note && <div className="text-xs text-slate-500 max-w-xs mt-1">{stream.note}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {stream.videoId ? <>Video <code>{stream.videoId}</code></> : stream.channelId ? <>Channel <code>{stream.channelId}</code></> : <span className="text-slate-500">Link-out only</span>}
                  </td>
                  <td className="px-6 py-4">
                    <form className="flex gap-2" onSubmit={(event) => {
                      event.preventDefault();
                      void run(stream.key, () => liveStreamsAPI.update(stream.key, { input: drafts[stream.key] ?? '' }), `${stream.name} updated`);
                    }}>
                      <input aria-label={`${stream.name} YouTube link`} value={drafts[stream.key] ?? ''} onChange={(event) => setDrafts({ ...drafts, [stream.key]: event.target.value })}
                        placeholder="https://www.youtube.com/watch?v=…" className="w-72 rounded-lg bg-slate-900 border border-slate-600 px-3 py-1.5 text-sm text-white" />
                      <button type="submit" disabled={busy === stream.key} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded-lg">
                        {drafts[stream.key] ? 'Save' : 'Clear'}
                      </button>
                    </form>
                  </td>
                  <td className="px-6 py-4">
                    <input type="checkbox" aria-label={`Show ${stream.name}`} checked={stream.isEnabled} disabled={busy === stream.key}
                      onChange={(event) => run(stream.key, () => liveStreamsAPI.update(stream.key, { isEnabled: event.target.checked }), `${stream.name} ${event.target.checked ? 'shown' : 'hidden'}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
