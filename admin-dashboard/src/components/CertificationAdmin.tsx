import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { certificationAPI, type CertificationEventType, type CertificationRaceTotals, type CertificationStateRow } from '../lib/api';

/**
 * After the election (#136): record each state's certification, recounts and contests, its legal deadline, and
 * Alaska's or Maine's ranked-choice final round, each with the link to the state's own page. A state-wide entry
 * is written to every federal race in the state. Compare our totals with the state's certified ones before
 * certifying; if they differ, record a correction with the state's numbers in the notes.
 */
const EVENTS: Array<{ type: CertificationEventType; label: string }> = [
  { type: 'CERTIFIED', label: 'Certified' },
  { type: 'RECOUNT_STARTED', label: 'Recount started' },
  { type: 'RECOUNT_COMPLETED', label: 'Recount completed' },
  { type: 'CONTESTED', label: 'Contested in court' },
  { type: 'CORRECTED', label: 'Certified totals differ (correction)' },
];
const RANKED_CHOICE_STATES = new Set(['AK', 'ME']);
const number = new Intl.NumberFormat('en-US');
const input = 'bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white';
const button = 'px-3 py-1 rounded text-sm font-medium disabled:opacity-50';
/** A date entered for a state is stored as noon Eastern on that day. */
const atNoonEastern = (date: string) => `${date}T17:00:00Z`;

function RankedChoiceForm({ race, onSaved }: { race: CertificationRaceTotals; onSaved: (text: string) => void }) {
  const [round, setRound] = useState(String(race.rankedChoice[0]?.round ?? ''));
  const [sourceUrl, setSourceUrl] = useState('');
  const [votes, setVotes] = useState<Record<string, string>>(Object.fromEntries(race.rankedChoice.map((row) => [row.candidacyId, String(row.votes)])));
  const [winner, setWinner] = useState(race.rankedChoice.find((row) => row.isWinner)?.candidacyId ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    const results = race.candidates
      .filter((candidate) => votes[candidate.candidacyId]?.trim())
      .map((candidate) => ({ candidacyId: candidate.candidacyId, votes: Number(votes[candidate.candidacyId].replace(/,/g, '')), isWinner: candidate.candidacyId === winner }));
    try {
      await certificationAPI.setRankedChoice(race.contestId, { round: Number(round), sourceUrl, results });
      onSaved(`${race.race}: ranked-choice round ${round} saved`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    }
  };
  return (
    <div className="mt-2 p-3 rounded bg-slate-900/60 border border-slate-700 text-sm">
      <p className="text-slate-300 mb-2">State’s ranked-choice final round (leave a candidate empty if eliminated earlier).</p>
      <div className="flex flex-wrap gap-2 mb-2">
        <input className={`${input} w-20`} placeholder="Round" value={round} onChange={(event) => setRound(event.target.value)} />
        <input className={`${input} flex-1 min-w-64`} placeholder="Link to the state’s tabulation" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
      </div>
      {race.candidates.map((candidate) => (
        <label key={candidate.candidacyId} className="flex items-center gap-2 mb-1 text-slate-200">
          <input type="radio" name={`winner-${race.contestId}`} checked={winner === candidate.candidacyId} onChange={() => setWinner(candidate.candidacyId)} />
          <span className="w-56">{candidate.name}</span>
          <input className={`${input} w-32`} placeholder="Votes" value={votes[candidate.candidacyId] ?? ''}
            onChange={(event) => setVotes({ ...votes, [candidate.candidacyId]: event.target.value })} />
        </label>
      ))}
      <button className={`${button} bg-amber-500 text-slate-900 mt-2`} onClick={save}>Save final round</button>
      {error && <p className="text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export function CertificationAdmin() {
  const [states, setStates] = useState<CertificationStateRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [totals, setTotals] = useState<CertificationRaceTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deadline, setDeadline] = useState({ deadline: '', sourceUrl: '', notes: '' });
  const [event, setEvent] = useState({ type: 'CERTIFIED' as CertificationEventType, race: '', date: '', sourceUrl: '', notes: '' });

  const load = useCallback(async () => {
    try {
      setStates((await certificationAPI.list()).states);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load certification' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = async (state: string) => {
    setSelected(state);
    setMessage(null);
    const row = states.find((item) => item.state === state);
    setDeadline({ deadline: row?.deadline?.deadline ?? '', sourceUrl: row?.deadline?.sourceUrl ?? '', notes: row?.deadline?.notes ?? '' });
    setEvent({ type: 'CERTIFIED', race: '', date: '', sourceUrl: '', notes: '' });
    try {
      setTotals((await certificationAPI.totals(state)).races);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load totals' });
    }
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ type: 'success', text: await action() });
      await load();
      if (selected) setTotals((await certificationAPI.totals(selected)).races);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-amber-400" />
          Certification · 2026 federal races
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Enter what each state publishes, with the link to its page. Before certifying, compare our totals with the state’s certified results;
          if they differ, record “Certified totals differ” with the state’s numbers in the notes.
        </p>
      </div>
      {message && <p className={`px-6 pt-3 text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
      {loading ? (
        <div className="p-6 text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="overflow-x-auto max-h-[32rem]">
            <table className="w-full text-sm text-left">
              <thead className="text-slate-400"><tr><th className="py-1">State</th><th>Certified</th><th>Recount</th><th>Deadline</th></tr></thead>
              <tbody>
                {states.map((row) => (
                  <tr key={row.state} className={`cursor-pointer border-t border-slate-700 ${selected === row.state ? 'bg-slate-700/60' : 'hover:bg-slate-700/30'}`} onClick={() => void open(row.state)}>
                    <td className="py-1 font-medium text-white">{row.state}</td>
                    <td className={row.certified === row.races ? 'text-emerald-400' : 'text-slate-300'}>{row.certified}/{row.races}</td>
                    <td className="text-slate-300">{row.recount || ''}</td>
                    <td className="text-slate-300">{row.deadline?.deadline ?? <span className="text-slate-500">not entered</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="text-white font-semibold mb-2">{selected} · certification deadline</h3>
                <div className="flex flex-wrap gap-2">
                  <input type="date" className={input} value={deadline.deadline} onChange={(e) => setDeadline({ ...deadline, deadline: e.target.value })} />
                  <input className={`${input} flex-1 min-w-64`} placeholder="Link to the source (NCSL or the state’s law)" value={deadline.sourceUrl} onChange={(e) => setDeadline({ ...deadline, sourceUrl: e.target.value })} />
                  <button className={`${button} bg-slate-600 text-white`} disabled={busy} onClick={() => run(async () => {
                    await certificationAPI.setDeadline(selected, { ...deadline, notes: deadline.notes || null });
                    return `${selected}: deadline saved`;
                  })}>Save deadline</button>
                </div>
              </section>
              <section>
                <h3 className="text-white font-semibold mb-2">{selected} · record from the state</h3>
                <div className="flex flex-wrap gap-2">
                  <select className={input} value={event.type} onChange={(e) => setEvent({ ...event, type: e.target.value as CertificationEventType })}>
                    {EVENTS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                  </select>
                  <select className={input} value={event.race} onChange={(e) => setEvent({ ...event, race: e.target.value })}>
                    <option value="">Every federal race in {selected}</option>
                    {totals.map((race) => <option key={race.race} value={race.race}>{race.race}</option>)}
                  </select>
                  <input type="date" className={input} value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} />
                  <input className={`${input} flex-1 min-w-64`} placeholder="Link to the state’s certified results or notice" value={event.sourceUrl} onChange={(e) => setEvent({ ...event, sourceUrl: e.target.value })} />
                  <input className={`${input} w-full`} placeholder="Notes (for a correction: the state’s numbers)" value={event.notes} onChange={(e) => setEvent({ ...event, notes: e.target.value })} />
                  <button className={`${button} bg-amber-500 text-slate-900`} disabled={busy || !event.date} onClick={() => run(async () => {
                    const result = await certificationAPI.record(selected, { type: event.type, race: event.race || null, effectiveAt: atNoonEastern(event.date), sourceUrl: event.sourceUrl, notes: event.notes || null });
                    return `Recorded for ${result.races.join(', ')}${result.finalsPass ? '; a finals pass for the state has started' : ''}`;
                  })}>Record</button>
                  <button className={`${button} bg-slate-700 text-slate-200`} disabled={busy} onClick={() => run(async () => {
                    const result = await certificationAPI.removeLatest(selected, event.race || null);
                    return `Removed the latest entry from ${result.removed} race(s)`;
                  })}>Undo latest entry</button>
                </div>
              </section>
              <section>
                <h3 className="text-white font-semibold mb-2">{selected} · our totals (civicAPI) to compare</h3>
                {totals.map((race) => (
                  <div key={race.race} className="border-t border-slate-700 py-2">
                    <p className="text-slate-200 font-medium">
                      {race.race} · {race.totalVotes === null ? 'no total' : `${number.format(race.totalVotes)} votes`} · {race.counties} counties
                      {race.lastChangedAt && <span className="text-slate-500"> · count last changed {new Date(race.lastChangedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </p>
                    <ul className="text-slate-300">
                      {race.candidates.map((candidate) => <li key={candidate.candidacyId}>{candidate.name} ({candidate.party ?? 'no party'}): {number.format(candidate.votes)}</li>)}
                    </ul>
                    {RANKED_CHOICE_STATES.has(selected) && <RankedChoiceForm race={race} onSaved={(text) => void run(async () => text)} />}
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
