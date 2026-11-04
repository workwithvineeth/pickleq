import { useState, type FormEvent } from 'react';
import { TAGS } from '../../domain/types';
import type { Go } from '../../navigation';
import { backend, rememberReturn, serverBackend } from '../index';
import type { StudioLog, StudioLogInput } from '../playerStudio';
import { errorText, Header, Status, useLoad } from './common';

const blank: StudioLogInput = {
  kind: 'practice', played_on: '', opponents: '', partner: '', location: '',
  score_for: 0, score_against: 0, reflection: '', tags: {},
};

export function PlayerStudio({ go, onBack }: { go: Go; onBack: () => void }) {
  const b = backend()?.kind === 'server' ? serverBackend() : null;
  const state = useLoad(async () => (await b?.currentUser()) ? { logs: await b!.studioLogs() } : null, [b]);
  const [form, setForm] = useState<StudioLogInput>(blank);
  const [editing, setEditing] = useState<string>();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  function change<K extends keyof StudioLogInput>(key: K, value: StudioLogInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function cycle(tag: string) {
    const tags = { ...form.tags };
    if (tags[tag] === 'needs-work') tags[tag] = 'went-well';
    else if (tags[tag] === 'went-well') delete tags[tag];
    else {
      change('tags', { ...tags, [tag]: 'needs-work' });
      return;
    }
    change('tags', tags);
  }
  function edit(log: StudioLog) {
    const { id, ...input } = log;
    setEditing(id);
    setForm(input);
    setMessage(undefined);
    setCustom('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!b || busy) return;
    if (!form.opponents.trim() || form.score_for === form.score_against) {
      setMessage({ ok: false, text: 'Enter an opponent and two different scores.' });
      return;
    }
    setBusy(true);
    try {
      await b.saveStudioLog({ ...form, opponents: form.opponents.trim() }, editing);
      setForm(blank);
      setEditing(undefined);
      setCustom('');
      setMessage({ ok: true, text: 'Private match saved.' });
      state.reload();
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return <main className="screen" aria-labelledby="studio-title">
    <Header id="studio-title" title="Player Studio" onBack={onBack} />
    <Status loading={state.loading && !state.data} error={state.error} />
    {!state.loading && !state.error && !state.data && <button type="button" className="btn btn-primary" onClick={() => {
      rememberReturn('#/club-player-studio');
      go('club-signin');
    }}>Sign in to Player Studio</button>}
    {state.data && <>
      <section className="card section" aria-label="DUPR rating">
        <h2>DUPR</h2>
        <p className="small muted">Not connected. Private practice and casual logs do not update DUPR.</p>
      </section>
      <form className="card section" onSubmit={save} aria-label="Private match log">
        <h2>{editing ? 'Edit private match' : 'Log a private match'}</h2>
        <p className="small muted">Self-reported practice and casual matches, visible to your account only.</p>
        <label>Match type<select className="input" value={form.kind} onChange={(e) => change('kind', e.target.value === 'casual' ? 'casual' : 'practice')}>
          <option value="practice">Practice</option><option value="casual">Casual</option>
        </select></label>
        <label>Date<input className="input" type="date" required value={form.played_on} onChange={(e) => change('played_on', e.target.value)} /></label>
        <label>Opponents<input className="input" required maxLength={120} value={form.opponents} onChange={(e) => change('opponents', e.target.value)} /></label>
        <label>Partner (doubles)<input className="input" maxLength={80} value={form.partner} onChange={(e) => change('partner', e.target.value)} /></label>
        <label>Location<input className="input" maxLength={100} value={form.location} onChange={(e) => change('location', e.target.value)} /></label>
        <div className="row">
          <label>Your score<input className="input" type="number" required min={0} max={99} value={form.score_for} onChange={(e) => change('score_for', e.target.valueAsNumber)} /></label>
          <label>Opponent score<input className="input" type="number" required min={0} max={99} value={form.score_against} onChange={(e) => change('score_against', e.target.valueAsNumber)} /></label>
        </div>
        <label>Reflection<textarea className="input" maxLength={1000} value={form.reflection} onChange={(e) => change('reflection', e.target.value)} /></label>
        <p className="small muted">Tap a skill to cycle through needs work, went well, and clear.</p>
        <div className="meta" aria-label="Skill tags">
          {[...new Set([...TAGS, ...Object.keys(form.tags)])].map((tag) => <button type="button" className="btn btn-outline" key={tag} onClick={() => cycle(tag)}>
            {tag}{form.tags[tag] ? ' · ' + (form.tags[tag] === 'needs-work' ? 'Needs work' : 'Went well') : ''}
          </button>)}
        </div>
        <label>Custom skill<input className="input" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
        <button type="button" className="btn btn-outline" disabled={!custom.trim() || Object.keys(form.tags).includes(custom.trim())}
          onClick={() => { cycle(custom.trim()); setCustom(''); }}>Add custom skill</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save private match'}</button>
        {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      </form>
      <section className="section" aria-label="Private match history">
        <h2>Private match history</h2>
        {state.data.logs.length === 0 && <p className="small muted">No practice or casual matches yet.</p>}
        {state.data.logs.map((log) => <article className="card section" key={log.id}>
          <b>{log.opponents} · {log.score_for}–{log.score_against}</b>
          <p className="small muted">{log.played_on} · Self-reported {log.kind}</p>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => edit(log)}>Edit match</button>
        </article>)}
      </section>
    </>}
  </main>;
}
