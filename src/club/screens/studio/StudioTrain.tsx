import { useState, type FormEvent } from 'react';
import { RATED_SHOTS, SESSION_TYPES, STARTER_DRILLS, type SessionType } from '../../../domain/types';
import { friendlyDate } from '../../dates';
import { sessionProblem, studioStats, type StudioSession, type StudioSessionInput } from '../../playerStudio';
import { errorText } from '../common';
import { Card, Evidence, plural, Rate, today, type SectionProps } from './shared';

const TYPE_LABEL = Object.fromEntries(SESSION_TYPES.map((t) => [t.value, t.label])) as Record<SessionType, string>;
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function drillNames(sessions: StudioSession[]): string[] {
  return [...new Set([...STARTER_DRILLS, ...sessions.flatMap((s) => s.drills.map((d) => d.category))])];
}

export function StudioTrain(p: SectionProps & { route: string }) {
  const [top, id] = p.route.split('.');
  if (top === 'practice') return <PracticeForm {...p} session={id ? p.data.sessions.find((s) => s.id === id) : undefined} />;
  const st = studioStats(p.data);
  const maxDay = Math.max(60, ...st.week.map((d) => d.minutes));
  return <>
    <div className="meta"><button type="button" className="btn btn-primary" onClick={() => p.go('club-player-studio', 'practice')}>+ Log practice</button></div>
    <Card title="This week">
      <p style={{ margin: 0 }}><b>{st.weekMinutes} min</b> · {plural(st.streak, 'day')} in a row</p>
      <div className="pq-week" role="list" aria-label="Minutes each day this week">
        {st.week.map((d, i) => <div key={d.date} role="listitem" className="pq-week-day" aria-label={`${DAY[i]}: ${d.rest ? 'rest day' : `${d.minutes} minutes`}`}>
          <span className="pq-week-bar"><span style={{ height: `${Math.round((d.minutes / maxDay) * 100)}%` }} className={d.rest ? 'rest' : ''} /></span>
          <span className="small muted" aria-hidden="true">{DAY[i][0]}</span>
        </div>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Last 30 days: {plural(st.sessions30, 'session')}, {st.minutes30} minutes.</p>
    </Card>
    <Card title="Drill success" action={<Evidence measured />}>
      {st.drills.length === 0 && <p className="small muted" style={{ margin: 0 }}>Count made out of tries in a practice session to see this.</p>}
      {st.drills.length > 0 && <table className="table" aria-label="Drill success">
        <thead><tr><th>Drill</th><th>Made</th><th>Rate</th><th>Last</th></tr></thead>
        <tbody>{st.drills.map((d) => <tr key={d.category}><td>{d.category}</td><td>{d.made}/{d.attempts}</td><td>{d.pct}%</td><td>{d.last ?? '—'}%</td></tr>)}</tbody>
      </table>}
    </Card>
    <section className="section" aria-label="Practice sessions">
      <h2 className="pq-kicker">SESSIONS</h2>
      {p.data.sessions.length === 0 && <p className="small muted">No practice logged yet.</p>}
      {p.data.sessions.map((s) => <button key={s.id} type="button" className="match-row" aria-label={`${TYPE_LABEL[s.kind]} on ${friendlyDate(s.session_on)}`} onClick={() => p.go('club-player-studio', `practice.${s.id}`)}>
        <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{TYPE_LABEL[s.kind]}{s.kind === 'rest' ? '' : ` · ${s.minutes} min`}</b>
          <span className="small muted">{friendlyDate(s.session_on)}{s.drills.length ? ` · ${s.drills.map((d) => `${d.category} ${d.made}/${d.attempts}`).join(', ')}` : ''}</span></span>
        <span aria-hidden="true">›</span>
      </button>)}
    </section>
  </>;
}

const blank = (): StudioSessionInput => ({ session_on: today(), kind: 'solo', minutes: 45, intensity: null, drills: [], ratings: {}, note: '' });

function PracticeForm({ data, reload, go, b, session }: SectionProps & { session?: StudioSession }) {
  const [form, setForm] = useState<StudioSessionInput>(() => (session ? (({ id: _i, created_at: _c, ...x }) => x)(session) : blank()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const set = <K extends keyof StudioSessionInput>(k: K, v: StudioSessionInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rest = form.kind === 'rest';
  const names = drillNames(data.sessions);
  async function save(e: FormEvent) {
    e.preventDefault();
    const bad = sessionProblem(form);
    if (bad) { setMsg(bad); return; }
    setBusy(true);
    try { await b.saveStudioSession(form, session?.id); reload(); go('club-player-studio', 'train'); }
    catch (err) { setMsg(errorText(err)); setBusy(false); }
  }
  async function remove() {
    if (!session || !window.confirm('Delete this session from your diary?')) return;
    setBusy(true);
    try { await b.deleteStudioSession(session.id); reload(); go('club-player-studio', 'train'); }
    catch (err) { setMsg(errorText(err)); setBusy(false); }
  }
  return <form className="card section" onSubmit={save} aria-label="Log practice">
    <h2>{session ? 'Edit practice' : 'Log practice'}</h2>
    <label>Date<input className="input" type="date" required max={today()} value={form.session_on} onChange={(e) => set('session_on', e.target.value)} /></label>
    <fieldset className="pq-choices"><legend>What did you do?</legend>
      {SESSION_TYPES.map((t) => <label key={t.value} className={`pq-choice${form.kind === t.value ? ' on' : ''}`}>
        <input type="radio" name="session-type" className="sr-only" checked={form.kind === t.value} onChange={() => set('kind', t.value)} />{t.label}
      </label>)}
    </fieldset>
    {!rest && <>
      <label>Minutes<input className="input" type="number" inputMode="numeric" min={1} max={600} value={Number.isFinite(form.minutes) ? form.minutes : ''} onChange={(e) => set('minutes', e.target.valueAsNumber)} /></label>
      <Rate label="Intensity" value={form.intensity} onChange={(v) => set('intensity', v)} />
      <fieldset className="pq-games"><legend>Drills (count made out of tries)</legend>
        <datalist id="pq-drill-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        {form.drills.map((d, i) => <div key={i} className="row" role="group" aria-label={`Drill ${i + 1}`}>
          <label style={{ flex: 2 }}>Drill<input className="input" list="pq-drill-names" maxLength={40} value={d.category} onChange={(e) => set('drills', form.drills.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} /></label>
          <label style={{ flex: 1 }}>Made<input className="input" type="number" inputMode="numeric" min={0} value={Number.isFinite(d.made) ? d.made : ''} onChange={(e) => set('drills', form.drills.map((x, j) => (j === i ? { ...x, made: e.target.valueAsNumber } : x)))} /></label>
          <label style={{ flex: 1 }}>Tries<input className="input" type="number" inputMode="numeric" min={1} value={Number.isFinite(d.attempts) ? d.attempts : ''} onChange={(e) => set('drills', form.drills.map((x, j) => (j === i ? { ...x, attempts: e.target.valueAsNumber } : x)))} /></label>
          <button type="button" className="link-btn" aria-label={`Remove drill ${i + 1}`} onClick={() => set('drills', form.drills.filter((_, j) => j !== i))}>Remove</button>
        </div>)}
        {form.drills.length < 20 && <button type="button" className="btn btn-outline" onClick={() => set('drills', [...form.drills, { category: names[form.drills.length % names.length] ?? 'Dinks', made: 0, attempts: 20 }])}>+ Add drill</button>}
      </fieldset>
      <details className="pq-details"><summary>Rate your shots today (your estimate)</summary>
        {RATED_SHOTS.map((s) => <Rate key={s} label={s} value={form.ratings[s]} onChange={(v) => { const r = { ...form.ratings }; if (v === null) delete r[s]; else r[s] = v; set('ratings', r); }} />)}
      </details>
    </>}
    {rest && <p className="small muted" style={{ margin: 0 }}>Rest days count towards your streak.</p>}
    <label>Notes<textarea className="input" maxLength={1000} value={form.note} onChange={(e) => set('note', e.target.value)} /></label>
    {msg && <p role="alert" style={{ margin: 0 }}>{msg}</p>}
    <div className="meta">
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : rest ? 'Save rest day' : 'Save practice'}</button>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => go('club-player-studio', 'train')}>Cancel</button>
      {session && <button type="button" className="btn pq-danger" disabled={busy} onClick={() => void remove()}>Delete session</button>}
    </div>
  </form>;
}
