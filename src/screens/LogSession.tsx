import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Chips, Field, Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import { addDrillCategory, addSession, checkSession, drillNames, trashSession, updateSession } from '../db/training';
import { SESSION_TYPES, type DrillResult, type SessionType } from '../domain/types';
import type { Go } from '../navigation';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DURATIONS = [30, 45, 60, 90, 120];

export function LogSession({ sessionId, go, onClose }: { sessionId?: string; go: Go; onClose: () => void }) {
  const existing = useLiveQuery(async () => (sessionId ? ((await db.sessions.get(sessionId)) ?? null) : null), [sessionId]);
  const names = useLiveQuery(() => drillNames(), []) ?? [];
  const [loaded, setLoaded] = useState(!sessionId);
  const [date, setDate] = useState(today());
  const [type, setType] = useState<SessionType>('solo');
  const [minutes, setMinutes] = useState(60);
  const [customMin, setCustomMin] = useState('');
  const [intensity, setIntensity] = useState<number | undefined>();
  const [fatigue, setFatigue] = useState<number | undefined>();
  const [drills, setDrills] = useState<DrillResult[]>([]);
  const [notes, setNotes] = useState('');
  const [newDrill, setNewDrill] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!sessionId || !existing || loaded) return;
    setDate(existing.date);
    setType(existing.type);
    setMinutes(existing.minutes);
    if (!DURATIONS.includes(existing.minutes) && existing.minutes > 0) setCustomMin(String(existing.minutes));
    setIntensity(existing.intensity);
    setFatigue(existing.fatigue);
    setDrills(existing.drills.map((d) => ({ ...d })));
    setNotes(existing.notes ?? '');
    setLoaded(true);
  }, [sessionId, existing, loaded]);

  if (sessionId && existing === null) return <main className="screen"><p>Session not found.</p></main>;
  if (!loaded) return <main className="screen"><p className="muted">Loading…</p></main>;

  const rest = type === 'rest';
  const setDrill = (i: number, d: DrillResult) => setDrills((all) => all.map((x, j) => (j === i ? d : x)));

  async function save() {
    const mins = rest ? 0 : customMin.trim() ? Number(customMin) : minutes;
    const clean = rest ? [] : drills;
    const problem = checkSession({ type, minutes: mins, drills: clean });
    if (problem) return setError(problem);
    const payload = { date, type, minutes: mins, intensity: rest ? undefined : intensity, fatigue, drills: clean, notes: notes.trim() || undefined };
    if (sessionId) await updateSession(sessionId, payload);
    else await addSession(payload);
    onClose();
  }

  async function createDrill() {
    const problem = await addDrillCategory(newDrill);
    if (problem) return setError(problem);
    setDrills((all) => [...all, { category: newDrill.trim().replace(/\s+/g, ' '), made: 0, attempts: 20 }]);
    setNewDrill('');
    setError(null);
  }

  return (
    <main className="screen" aria-labelledby="session-title">
      <header className="header">
        <h1 id="session-title" className="screen-title">{sessionId ? 'Edit session' : 'Log training'}</h1>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
      </header>

      <Chips label="Session type" value={type} options={SESSION_TYPES} onChange={(t) => { setType(t); setError(null); }} />
      <div className="person" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <label className="label" htmlFor="session-date">Date</label>
        <input id="session-date" className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
      </div>

      {rest ? (
        <div className="notice notice-ok">Rest days keep your training streak going.</div>
      ) : (
        <>
          <Field label="Duration (minutes)">
            <Chips label="Duration" value={customMin ? null : minutes} options={DURATIONS.map((v) => ({ value: v, label: `${v}` }))} onChange={(v) => { setMinutes(v); setCustomMin(''); setError(null); }} />
            <input className="input" aria-label="Other duration in minutes" inputMode="numeric" placeholder="Other (minutes)" value={customMin} onChange={(e) => { setCustomMin(e.target.value.replace(/\D/g, '')); setError(null); }} />
          </Field>
          <Field label="Intensity (1 = easy, 5 = all-out)">
            <Chips label="Intensity" value={intensity} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => setIntensity(intensity === v ? undefined : v)} />
          </Field>
        </>
      )}
      <Field label="Fatigue afterwards (1 = fresh, 5 = exhausted)">
        <Chips label="Fatigue" value={fatigue} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => setFatigue(fatigue === v ? undefined : v)} />
      </Field>

      {!rest && (
        <section className="card section" aria-label="Drills">
          <div className="header"><h2 style={{ fontSize: 18 }}>Drills</h2><span className="pill pill-ok">Measured</span></div>
          <p className="small muted" style={{ margin: 0 }}>Add a drill, then count how many you made out of how many tries.</p>
          {drills.map((d, i) => (
            <div key={i} className="section" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div className="header">
                <b style={{ fontWeight: 600 }}>{d.category}</b>
                <span className="small muted">{d.attempts ? `${Math.round((d.made / d.attempts) * 100)}%` : ''}</span>
              </div>
              <div className="scores">
                <Stepper label="Made" value={d.made} max={500} onChange={(v) => setDrill(i, { ...d, made: v })} />
                <Stepper label="Tries" value={d.attempts} max={500} onChange={(v) => setDrill(i, { ...d, attempts: v })} />
              </div>
              <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDrills((all) => all.filter((_, j) => j !== i))}>Remove {d.category}</button>
            </div>
          ))}
          <div className="label">Add a drill</div>
          <div className="chips" role="group" aria-label="Add a drill">
            {names.filter((n) => !drills.some((d) => d.category === n)).map((n) => (
              <button key={n} type="button" className="chip" onClick={() => { setDrills((all) => [...all, { category: n, made: 0, attempts: 20 }]); setError(null); }}>+ {n}</button>
            ))}
          </div>
          <div className="person" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <input className="input" aria-label="New drill name" placeholder="Your own drill, e.g. Erne practice" value={newDrill} onChange={(e) => setNewDrill(e.target.value)} />
            <button type="button" className="btn btn-outline" style={{ minHeight: 44 }} onClick={createDrill}>Add</button>
          </div>
        </section>
      )}

      <Field label="Notes">
        <textarea className="input" aria-label="Session notes" placeholder="What clicked, what to work on next…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <div role="status" className="msg msg-bad">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={save}>{sessionId ? 'Save changes' : 'Save session'}</button>

      {sessionId && (confirmDelete ? (
        <div className="card section">
          <div>Move this session to Trash? You can restore it for 30 days.</div>
          <div className="sticky-actions" style={{ position: 'static' }}>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={async () => { await trashSession(sessionId); go('train', undefined, { replace: true }); }}>Move to Trash</button>
          </div>
        </div>
      ) : (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDelete(true)}>Delete session</button>
      ))}
    </main>
  );
}
