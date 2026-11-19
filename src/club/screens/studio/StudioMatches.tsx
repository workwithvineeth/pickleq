import { useState, type FormEvent } from 'react';
import { RATED_SHOTS, TAGS, type MatchType, type Strength } from '../../../domain/types';
import { friendlyDate } from '../../dates';
import { blankLog, logProblem, logTotals, matchStory, opponentsOf, partnerOf, scoreText, stageText, type StudioLog, type StudioLogInput } from '../../playerStudio';
import { errorText } from '../common';
import { Card, Rate, Result, Seg, today, type SectionProps } from './shared';

const MOMENTUM_TEXT = { 'came-back': 'Came back', 'lost-lead': 'Lost a lead', dominated: 'Led all the way', neither: 'Close throughout' } as const;

export function StudioMatches(p: SectionProps & { route: string }) {
  const [top, id] = p.route.split('.');
  const [tab, setTab] = useState<'official' | 'mine'>(p.data.official.length || top === 'official' ? 'official' : 'mine');
  if (top === 'official' && id) return <OfficialDetail {...p} id={id} />;
  if (top === 'log') return <LogForm {...p} log={id ? p.data.logs.find((l) => l.id === id) : undefined} />;
  return <>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Seg label="Which matches" value={tab} options={[{ value: 'official', label: `Official (${p.data.official.length})` }, { value: 'mine', label: `My logs (${p.data.logs.length})` }]} onChange={setTab} />
    </div>
    {tab === 'official' ? <section className="section" aria-label="Official matches">
      <p className="small muted" style={{ margin: 0 }}>Results from RallyQ tournaments you claimed. Read-only: the organiser corrects scores.</p>
      {p.data.official.length === 0 && <p className="small muted">No official matches yet. Open the claim link your organiser sent you.</p>}
      {p.data.official.map((o) => <button key={o.id} type="button" className="match-row" aria-label={`${o.tournament} ${stageText(o)} against ${opponentsOf(o)}`} onClick={() => p.go('club-player-studio', `official.${o.id}`)}>
        <Result won={o.winner === o.mySide} />
        <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{opponentsOf(o)}</b>
          <span className="small muted">{scoreText(o)} · {o.tournament} · {stageText(o)} · {friendlyDate(o.playedOn)}</span></span>
        <span aria-hidden="true">›</span>
      </button>)}
    </section> : <section className="section" aria-label="My logged matches">
      <button type="button" className="btn btn-primary" onClick={() => p.go('club-player-studio', 'log')}>+ Log a match</button>
      <p className="small muted" style={{ margin: 0 }}>Casual and practice games, private to you. Tournament matches come from official results.</p>
      {p.data.logs.length === 0 && <p className="small muted">Nothing logged yet.</p>}
      {p.data.logs.map((l) => <button key={l.id} type="button" className="match-row" aria-label={`${l.kind} match against ${l.opponents}`} onClick={() => p.go('club-player-studio', `log.${l.id}`)}>
        <Result won={l.score_for > l.score_against} />
        <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{l.opponents}</b>
          <span className="small muted">{(l.games.length ? l.games : [{ you: l.score_for, them: l.score_against }]).map((g) => `${g.you}–${g.them}`).join(', ')} · {l.kind === 'casual' ? 'Casual' : 'Practice'} · {friendlyDate(l.played_on)}</span></span>
        <span aria-hidden="true">›</span>
      </button>)}
    </section>}
  </>;
}

function OfficialDetail({ data, go, id }: SectionProps & { id: string }) {
  const o = data.official.find((x) => x.id === id);
  if (!o) return <p className="small muted">That match isn’t in your official history.</p>;
  const story = matchStory(o);
  const partner = partnerOf(o);
  return <>
    <button type="button" className="link-btn" onClick={() => go('club-player-studio', 'matches')}>‹ All matches</button>
    <Card title={`${o.winner === o.mySide ? 'Won' : 'Lost'} against ${opponentsOf(o)}`} label="Official match">
      <p className="small muted" style={{ margin: 0 }}>{o.tournament} · {o.division ? `${o.division} · ` : ''}{stageText(o)} · {o.club} · {friendlyDate(o.playedOn)}</p>
      {partner && <p className="small" style={{ margin: 0 }}>With {partner}</p>}
      <ol className="pq-plain-list" aria-label="Games">
        {story.games.map((g, i) => <li key={i} className="row" style={{ justifyContent: 'space-between' }}>
          <span>Game {i + 1}: <b>{g.you}–{g.them}</b></span>
          {story.tracked && <span className="small">{MOMENTUM_TEXT[g.momentum]}{g.from ? ` (from ${g.from})` : ''}</span>}
        </li>)}
      </ol>
      <p className="small muted" style={{ margin: 0 }}>{story.tracked ? 'Momentum comes from the point-by-point scoring on court.' : 'Only the final score was recorded, so there’s no momentum for this match.'} Official result: read-only. If a score is wrong, ask the organiser to correct it.</p>
    </Card>
  </>;
}

function LogForm({ data, reload, go, b, log }: SectionProps & { log?: StudioLog }) {
  const [form, setForm] = useState<StudioLogInput>(() => {
    if (!log) return blankLog(today());
    const { id: _id, created_at: _c, ...input } = log;
    return { ...input, games: input.games.length ? input.games : [{ you: input.score_for, them: input.score_against }] };
  });
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const set = <K extends keyof StudioLogInput>(k: K, v: StudioLogInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setGame = (i: number, side: 'you' | 'them', v: number) => set('games', form.games.map((g, j) => (j === i ? { ...g, [side]: v } : g)));
  function cycle(tag: string) {
    const tags = { ...form.tags };
    if (tags[tag] === 'needs-work') tags[tag] = 'went-well'; else if (tags[tag] === 'went-well') delete tags[tag]; else tags[tag] = 'needs-work';
    set('tags', tags);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const bad = logProblem(form);
    if (bad) { setMsg({ ok: false, text: bad }); return; }
    setBusy(true);
    try { await b.saveStudioLog(form, log?.id); reload(); go('club-player-studio', 'matches'); }
    catch (err) { setMsg({ ok: false, text: errorText(err) }); setBusy(false); }
  }
  async function remove() {
    if (!log || !window.confirm('Delete this match from your diary?')) return;
    setBusy(true);
    try { await b.deleteStudioLog(log.id); reload(); go('club-player-studio', 'matches'); }
    catch (err) { setMsg({ ok: false, text: errorText(err) }); setBusy(false); }
  }
  const total = logTotals(form.games);
  const type: MatchType = form.match_type ?? (form.partner.trim() ? 'doubles' : 'singles');
  const players = [...new Set(data.logs.flatMap((l) => [...l.opponents.split(/[,&]/), l.partner]).map((n) => n.trim()).filter(Boolean))];
  return <form className="card section" onSubmit={save} aria-label="Log a match">
    <h2>{log ? 'Edit match' : 'Log a match'}</h2>
    <label>Kind of match<select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value === 'practice' ? 'practice' : 'casual')}>
      <option value="casual">Casual</option><option value="practice">Practice</option><option value="tournament" disabled>Tournament (comes from official results)</option>
    </select></label>
    <Seg label="Match type" value={type} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'mixed', label: 'Mixed' }]} onChange={(v) => set('match_type', v)} />
    <label>Date<input className="input" type="date" required max={today()} value={form.played_on} onChange={(e) => set('played_on', e.target.value)} /></label>
    <datalist id="pq-people">{players.map((n) => <option key={n} value={n} />)}</datalist>
    <label>Opponents<input className="input" required list="pq-people" maxLength={120} placeholder="e.g. Ravi & Meena" value={form.opponents} onChange={(e) => set('opponents', e.target.value)} /></label>
    {type !== 'singles' && <label>Partner<input className="input" list="pq-people" maxLength={80} value={form.partner} onChange={(e) => set('partner', e.target.value)} /></label>}
    <span className="small">How strong were they? (optional)</span>
    <Seg label="Opponents were" value={form.opponent_strength ?? ('unknown' as Strength)} options={[{ value: 'weaker' as Strength, label: 'Weaker' }, { value: 'equal' as Strength, label: 'Even' }, { value: 'stronger' as Strength, label: 'Stronger' }]}
      onChange={(v) => set('opponent_strength', form.opponent_strength === v ? null : v)} />
    <fieldset className="pq-games"><legend>Score</legend>
      {form.games.map((g, i) => <div key={i} className="row" role="group" aria-label={`Game ${i + 1}`}>
        <span className="small" style={{ minWidth: 60 }}>Game {i + 1}</span>
        <label className="sr-only" htmlFor={`g${i}y`}>Game {i + 1} your score</label>
        <input id={`g${i}y`} className="input" type="number" inputMode="numeric" min={0} max={99} value={Number.isFinite(g.you) ? g.you : ''} onChange={(e) => setGame(i, 'you', e.target.valueAsNumber)} />
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`g${i}t`}>Game {i + 1} their score</label>
        <input id={`g${i}t`} className="input" type="number" inputMode="numeric" min={0} max={99} value={Number.isFinite(g.them) ? g.them : ''} onChange={(e) => setGame(i, 'them', e.target.valueAsNumber)} />
        {form.games.length > 1 && <button type="button" className="link-btn" aria-label={`Remove game ${i + 1}`} onClick={() => set('games', form.games.filter((_, j) => j !== i))}>Remove</button>}
      </div>)}
      {form.games.length < 5 && <button type="button" className="btn btn-outline" onClick={() => set('games', [...form.games, { you: 0, them: 0 }])}>+ Add game</button>}
      {form.games.length > 1 && <p className="small muted" style={{ margin: 0 }}>Games won: {total.for}–{total.against}</p>}
    </fieldset>
    <label>Where<input className="input" maxLength={100} value={form.location} onChange={(e) => set('location', e.target.value)} /></label>
    <span className="small">Indoor or outdoor (optional)</span>
    <Seg label="Indoor or outdoor" value={form.setting ?? ('none' as 'indoor')} options={[{ value: 'indoor', label: 'Indoor' }, { value: 'outdoor', label: 'Outdoor' }]} onChange={(v) => set('setting', form.setting === v ? null : v)} />
    <Rate label="Energy" value={form.energy} onChange={(v) => set('energy', v)} />
    <details className="pq-details"><summary>How did your shots feel? (your estimate)</summary>
      {RATED_SHOTS.map((s) => <Rate key={s} label={s} value={form.shot_ratings[s]} onChange={(v) => { const r = { ...form.shot_ratings }; if (v === null) delete r[s]; else r[s] = v; set('shot_ratings', r); }} />)}
    </details>
    <p className="small muted" style={{ margin: 0 }}>Tap a skill: needs work, then went well, then clear.</p>
    <div className="meta" aria-label="Skill tags" role="group">
      {[...new Set([...TAGS, ...Object.keys(form.tags)])].map((tag) => <button type="button" className={`btn btn-outline${form.tags[tag] ? ' on' : ''}`} key={tag} onClick={() => cycle(tag)}>
        {tag}{form.tags[tag] ? ' · ' + (form.tags[tag] === 'needs-work' ? 'Needs work' : 'Went well') : ''}
      </button>)}
    </div>
    <div className="row"><label style={{ flex: 1 }}>Custom skill<input className="input" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
      <button type="button" className="btn btn-outline" disabled={!custom.trim() || custom.trim() in form.tags} onClick={() => { cycle(custom.trim()); setCustom(''); }}>Add skill</button></div>
    <label>Notes<textarea className="input" maxLength={1000} value={form.reflection} onChange={(e) => set('reflection', e.target.value)} /></label>
    {msg && <p role={msg.ok ? 'status' : 'alert'} style={{ margin: 0 }}>{msg.text}</p>}
    <div className="meta">
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save match'}</button>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => go('club-player-studio', 'matches')}>Cancel</button>
      {log && <button type="button" className="btn pq-danger" disabled={busy} onClick={() => void remove()}>Delete match</button>}
    </div>
  </form>;
}
