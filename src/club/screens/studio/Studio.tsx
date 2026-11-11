import { PublicShell } from '../../../rallyq/shell/Shell';
import { useState, type FormEvent } from 'react';
import type { Go } from '../../../navigation';
import { eventsBackend, rememberReturn, serverBackend } from '../../index';
import { friendlyDate } from '../../dates';
import { fmtRating } from '../../../domain/record';
import {
  opponentsOf, scoreText, stageText, ALL_TIME, GOAL_LABEL, goalProgress, homeStory, ratingHistory, ratingPrefill, studioCoach, studioStats,
  type GoalKind, type RatingKind, type StudioData, type StudioGoal,
} from '../../playerStudio';
import { errorText, Header, Status, useLoad } from '../common';
import { Card, Evidence, plural, Seg, today, type SectionProps } from './shared';
import { StudioMatches } from './StudioMatches';
import { drillNames, StudioTrain } from './StudioTrain';
import { StudioCoach, StudioStats } from './StudioInsights';
import { RecapShare } from './Recap';
import { Panel } from '../Dash';
import './studio-green.css';

export const STUDIO_SECTIONS = [
  { id: 'home', label: 'Home' }, { id: 'matches', label: 'Matches' }, { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' }, { id: 'coach', label: 'Coach' }, { id: 'profile', label: 'Profile' },
] as const;

/** Player Studio: your official RallyQ results (read-only) and your private diary. Sections in a strip on phones, a side rail on laptops. */
export function PlayerStudio({ section, go }: { section: string; go: Go }) {
  const b = serverBackend();
  const state = useLoad(async () => {
    if (!b || !(await b.currentUser())) return null;
    const [data, found] = await Promise.all([b.studioData(), b.foundPlayers().catch(() => [])]);
    return { data, found };
  }, [b]);
  const top = section.split('.')[0] || 'home';
  const current = STUDIO_SECTIONS.some((s) => s.id === top) || top === 'log' || top === 'practice' || top === 'official' ? top : 'home';
  const navId = current === 'log' || current === 'official' ? 'matches' : current === 'practice' ? 'train' : current;
  const d = state.data;
  // Signed out: the v1.2 Player Studio welcome, in the public shell.
  if (b && !state.loading && !state.error && !d) return (
    <PublicShell go={go} active="studio">
      <section className="card" aria-label="Sign in" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ flex: '999 1 380px', minWidth: 0, padding: 'clamp(22px,4vw,44px)', display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          <span className="cap">Player Studio</span>
          <h1 id="studio-title" className="disp" style={{ fontSize: 'clamp(40px,7vw,72px)', lineHeight: .95, margin: 0 }}>Your game, in one place.</h1>
          <p className="mut" style={{ margin: 0, fontSize: 16, maxWidth: 520 }}>See your referee-scored tournament results, and keep a private diary of practice and casual games. Your club’s DUPR ratings for you show beside every match.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <button type="button" className="btn" onClick={() => { rememberReturn('#/club-player-studio'); go('club-signin'); }}>Sign in to Player Studio</button>
            <button type="button" className="btn ghost" onClick={() => go('events')}>See events</button>
          </div>
          <span className="mut" style={{ fontSize: 13 }}>Private by default. You choose what your club or the public can see.</span>
        </div>
        <div aria-hidden="true" style={{ flex: '1 1 280px', minHeight: 280, background: `url(${import.meta.env.BASE_URL}rallyq/cutout-player-card.webp) center bottom / contain no-repeat, radial-gradient(circle at 50% 60%, rgba(217,242,74,.18), transparent 65%)` }} />
      </section>
    </PublicShell>
  );
  return (
    <main className="screen wide-ok pq-studio pq-proto" aria-labelledby="studio-title">
      <Header id="studio-title" title="Player Studio" />
      <Status loading={state.loading && !d} error={state.error} />
      {!b && <p className="small muted">Player Studio needs the RallyQ server. It isn’t available in the demo club.</p>}
      {b && !state.loading && !state.error && !d && <section className="card section" aria-label="Sign in">
        <h2>Your game, in one place</h2>
        <p className="small" style={{ margin: 0 }}>See your referee-scored tournament results, and keep a private diary of practice and casual games.</p>
        <button type="button" className="btn btn-primary" onClick={() => { rememberReturn('#/club-player-studio'); go('club-signin'); }}>Sign in to Player Studio</button>
      </section>}
      {d && b && <div className="pq-studio-layout">
        <nav className="pq-studio-nav" aria-label="Player Studio">
          {STUDIO_SECTIONS.map((s) => <button key={s.id} type="button" aria-current={navId === s.id ? 'page' : undefined} onClick={() => go('club-player-studio', s.id === 'home' ? undefined : s.id)}>{s.label}</button>)}
        </nav>
        <div className="pq-studio-body">
          {d.found.length > 0 && current === 'home' && <FoundBanner found={d.found} go={go} />}
          {(() => {
            const p: SectionProps = { data: d.data, reload: state.reload, go, b };
            switch (current) {
              case 'matches': case 'log': case 'official': return <StudioMatches {...p} route={section} />;
              case 'train': case 'practice': return <StudioTrain {...p} route={section} />;
              case 'stats': return <StudioStats {...p} />;
              case 'coach': return <StudioCoach {...p} />;
              case 'profile': return <StudioProfile {...p} />;
              default: return <StudioHome {...p} />;
            }
          })()}
        </div>
      </div>}
    </main>
  );
}

function FoundBanner({ found, go }: { found: { playerId: string; name: string; club: string; matches: number }[]; go: Go }) {
  return (
    <section className="card section pq-found" aria-label="Matches found for you">
      <h2>We found your matches</h2>
      {found.map((f) => <div key={f.playerId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span><b>{f.name}</b> at {f.club} · {plural(f.matches, 'official match', 'official matches')}</span>
        <button type="button" className="btn btn-primary" onClick={() => go('club-claim', `p.${f.playerId}`)}>Review and claim</button>
      </div>)}
      <p className="small muted" style={{ margin: 0 }}>From tournaments you entered online with this account.</p>
    </section>
  );
}

// ---------- Home ----------

function StudioHome({ data, go }: SectionProps) {
  const st = studioStats(data);
  const coach = studioCoach(data)[0];
  const next = useLoad(async () => {
    const mine = await eventsBackend().myEntries().catch(() => []);
    return mine.filter((e) => e.startDate >= today() && (e.status === 'accepted' || e.status === 'pending' || e.status === 'waitlist')).sort((a, c) => a.startDate.localeCompare(c.startDate))[0] ?? null;
  }, []);
  const claimed = data.players.length > 0;
  const me = data.players[0];
  const off = data.official;
  const wins = off.filter((o) => o.winner === o.mySide).length;
  const kinds = [...new Set(off.map((o) => o.kind).filter(Boolean))].map((k) => (k === 'singles' ? 'Singles' : 'Doubles'));
  const form = off.slice(0, 4).map((o) => (o.winner === o.mySide ? 'W' : 'L'));
  const pointsFor = off.reduce((n, o) => n + o.games.reduce((m, g) => m + (o.mySide === 'A' ? g.a : g.b), 0), 0);
  const initials = (me?.name ?? 'Me').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const history=ratingHistory('doubles',data).slice().reverse();
  const ratingPath=history.map((r,i)=>(i?'L':'M')+(40+i/Math.max(1,history.length-1)*580)+','+(190-(r.value-1)/7*160)).join(' ');
  return <>
    <div className="pq-studio-home pq-proto">
      <div className="pq-studio-hero-grid">
        <section className="photo pq-studio-hero" aria-label="You">
          <img className="ph" src={import.meta.env.BASE_URL+'prototype6/court-night.jpg'} alt="" />
          <div className="pq-studio-hero-copy">
            <div className="pq-studio-badges"><span className="chip b">Player Studio</span>{claimed&&<span className="chip">Official results claimed</span>}<span className="pq-studio-initials" aria-hidden="true">{initials}</span></div>
            <h2 className="pq-studio-name">{me?.name ?? 'Your Player Studio'}</h2>
            <p>{[me?.club,kinds.join(' · ')].filter(Boolean).join(' · ')}</p>
            {(st.doublesRating!==undefined||st.singlesRating!==undefined)&&<div className="lgd pq-studio-rating" aria-label="Your recorded DUPR">{st.doublesRating!==undefined&&<div><span className="cap">DUPR doubles</span><strong className="n">{fmtRating(st.doublesRating)}</strong></div>}{st.singlesRating!==undefined&&<div><span className="cap">DUPR singles</span><strong className="n">{fmtRating(st.singlesRating)}</strong></div>}</div>}
            <p className="pq-studio-story">{homeStory(data)}</p>
            <div className="pq-studio-actions"><button type="button" className="btn btn-primary" onClick={()=>go('club-player-studio','matches')}>Explore recent matches</button><button type="button" className="btn btn-outline" onClick={()=>go('club-player-studio','practice')}>Log practice</button><button type="button" className="btn btn-outline" onClick={()=>go('club-player-studio','log')}>Log a match</button></div>
          </div>
        </section>
        {off.length>0&&<Panel title="Season snapshot">
          <span className="cap">Official results · all time</span>
          <div className="pq-snap"><span>Win rate</span><b className="n">{((100*wins)/off.length).toFixed(1)}%</b></div>
          <div className="pq-snap"><span>Official matches</span><b className="n">{off.length}</b></div>
          <div className="pq-snap"><span>Wins</span><b className="n">{wins}</b></div>
          <div className="pq-snap"><span>Points for</span><b className="n">{pointsFor}</b></div>
          {st.singlesRating!==undefined&&<div className="pq-snap"><span>Singles DUPR</span><b>{fmtRating(st.singlesRating)}</b></div>}
          {st.doublesRating!==undefined&&<div className="pq-snap"><span>Doubles DUPR</span><b>{fmtRating(st.doublesRating)}</b></div>}
          <button type="button" className="pq-studio-form" aria-label={'Recent form: '+form.join(' · ')} onClick={()=>go('club-player-studio','matches')}><span className="cap">Recent form</span><span>{form.map((f,i)=><i key={i} className={'pq-form-'+f}>{f}</i>)}</span><small>Last four official matches →</small></button>
        </Panel>}
      </div>
      <div className="pq-studio-detail-grid">
        {history.length>1&&<section className="lg card pq-studio-chart" aria-label="Rating over time"><div className="ch"><h2>Rating over time</h2><span className="chip">Doubles · recorded</span></div><svg viewBox="0 0 640 220" role="img" aria-label="Recorded doubles DUPR over time"><g stroke="currentColor" opacity=".15">{[40,100,160].map(y=><path key={y} d={'M40 '+y+'H620'}/>)}</g><path d={ratingPath+' L620 190L40 190Z'} fill="var(--pq-tint)"/><path d={ratingPath} fill="none" stroke="var(--pq-ball)" strokeWidth="3"/>{history.map((r,i)=><circle key={r.id} cx={40+i/(history.length-1)*580} cy={190-(r.value-1)/7*160} r="4" fill="var(--pq-ball)"><title>{r.date+' · '+fmtRating(r.value)}</title></circle>)}</svg><div className="pq-studio-chart-labels"><span>{friendlyDate(history[0].date)} · {fmtRating(history[0].value)}</span><span>{friendlyDate(history[history.length-1].date)} · {fmtRating(history[history.length-1].value)}</span></div><button type="button" className="link-btn" onClick={()=>go('club-player-studio','profile')}>Your DUPR readings →</button></section>}
        {st.ratings.length>0&&<Card title="Strengths & work-ons" action={<Evidence measured={false}/>}><div className="pq-studio-strengths">{st.ratings.map(r=><div key={r.shot}><div><span>{r.shot}</span><b>{r.average} / 5</b></div><div className="pq-studio-meter" role="img" aria-label={r.shot+' self-rating '+r.average+' out of 5'}><i style={{width:r.average/5*100+'%'}}/></div></div>)}</div><p className="small muted">Your shot estimates from the diary, not measured technique.</p></Card>}
        {coach&&<Card title="One thing to look at" action={<Evidence measured={coach.evidence==='measured'}/>}><p style={{margin:0}}>{coach.text}</p><button type="button" className="link-btn" onClick={()=>go('club-player-studio','coach')}>All coach notes</button></Card>}
        {off.length>0&&<Card title="Recent matches"><div className="pq-studio-recent">{off.slice(0,5).map(o=><button type="button" key={o.id} aria-label={'Open '+o.tournament+' '+stageText(o)} onClick={()=>go('club-player-studio','official.'+o.id)}><span className={'pq-studio-result '+(o.winner===o.mySide?'won':'lost')}>{o.winner===o.mySide?'W':'L'}</span><span><b>{opponentsOf(o)}</b><small>{o.tournament} · {stageText(o)} · {friendlyDate(o.playedOn)}</small></span><strong className="n">{scoreText(o)}</strong></button>)}</div><button type="button" className="link-btn" onClick={()=>go('club-player-studio','matches')}>All matches →</button></Card>}
        <Card title="Your private diary"><p className="small muted">Your practice and casual games stay yours.</p>{data.sessions.length>0&&<div className="pq-studio-diary-count"><b className="n">{plural(st.streak,'day')}</b><span>practice streak · {st.weekMinutes} min this week</span></div>}<div className="meta"><button type="button" className="btn btn-outline" onClick={()=>go('club-player-studio','train')}>Open diary</button><button type="button" className="btn btn-primary" onClick={()=>go('club-player-studio','practice')}>Log practice</button></div></Card>
        {next.data&&<Card title="Next event"><p><b>{next.data.tournament}</b> · {next.data.division}</p><p className="small muted">{next.data.club} · {friendlyDate(next.data.startDate)}{next.data.status!=='accepted'?' · waiting for the organiser':''}</p><button type="button" className="link-btn" onClick={()=>go('my-entries')}>My entries</button></Card>}
      </div>
      {off.length>0&&<RecapShare data={data}/>}
      {!claimed&&<Card title="Claim your tournament results"><p className="small">Open the claim link your organiser sent you (on WhatsApp or by email). Your official matches then show up here, read-only.</p></Card>}
      <Goals data={data}/>
    </div>
  </>;
}


// ---------- Goals (on Home, edited in place) ----------

const GOAL_KINDS: GoalKind[] = ['rating', 'weekly-minutes', 'drill-rate', 'streak', 'win-rate'];

function Goals({ data }: { data: StudioData }) {
  const b = serverBackend();
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState<StudioGoal[]>(data.settings.goals);
  const [draft, setDraft] = useState<StudioGoal>({ kind: 'weekly-minutes', target: 180 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const st = studioStats(data, ALL_TIME);
  async function save(next: StudioGoal[]) {
    try { await b!.saveStudioSettings({ ...data.settings, goals: next }); setGoals(next); setMsg({ ok: true, text: 'Goals saved.' }); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); }
  }
  function add(e: FormEvent) {
    e.preventDefault();
    if (!(draft.target > 0)) { setMsg({ ok: false, text: 'Enter a target above zero.' }); return; }
    if (draft.kind === 'drill-rate' && !draft.drill?.trim()) { setMsg({ ok: false, text: 'Name the drill.' }); return; }
    void save([...goals, { ...draft, drill: draft.drill?.trim() || undefined }].slice(0, 5));
  }
  return <Card title="Goals" action={<button type="button" className="link-btn" onClick={() => setEditing(!editing)}>{editing ? 'Done' : goals.length ? 'Edit goals' : 'Set a goal'}</button>}>
    {goals.length === 0 && !editing && <p className="small muted" style={{ margin: 0 }}>No goals yet. Set up to five.</p>}
    {goals.map((g, i) => {
      const p = goalProgress(g, st);
      return <div key={i} className="pq-goal">
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{p.text}</span>
          {editing && <button type="button" className="link-btn" aria-label={`Remove goal: ${p.text}`} onClick={() => void save(goals.filter((_, j) => j !== i))}>Remove</button>}</div>
        <div className="pq-bar" role="progressbar" aria-label={p.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}><span style={{ width: `${Math.round(p.fraction * 100)}%` }} /></div>
      </div>;
    })}
    {editing && goals.length < 5 && <form className="section" onSubmit={add} aria-label="New goal">
      <datalist id="pq-drill-names">{drillNames(data.sessions).map((n) => <option key={n} value={n} />)}</datalist>
      <label>Goal<select className="input" value={draft.kind} onChange={(e) => setDraft({ kind: e.target.value as GoalKind, target: e.target.value === 'rating' ? 4 : e.target.value === 'streak' ? 7 : e.target.value === 'weekly-minutes' ? 180 : 70 })}>
        {GOAL_KINDS.map((k) => <option key={k} value={k}>{GOAL_LABEL[k]}</option>)}
      </select></label>
      {draft.kind === 'rating' && <Seg label="Rating type" value={draft.rating ?? 'singles'} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={(v) => setDraft({ ...draft, rating: v })} />}
      {draft.kind === 'drill-rate' && <label>Drill<input className="input" list="pq-drill-names" maxLength={40} value={draft.drill ?? ''} onChange={(e) => setDraft({ ...draft, drill: e.target.value })} /></label>}
      <label>Target{draft.kind === 'weekly-minutes' ? ' (minutes a week)' : draft.kind === 'streak' ? ' (days in a row)' : draft.kind === 'rating' ? ' (DUPR)' : ' (%)'}
        <input className="input" type="number" inputMode="decimal" step={draft.kind === 'rating' ? 0.001 : 1} min={0} value={Number.isFinite(draft.target) ? draft.target : ''} onChange={(e) => setDraft({ ...draft, target: e.target.valueAsNumber })} /></label>
      <button type="submit" className="btn btn-outline">Add goal</button>
    </form>}
    {msg && <p role={msg.ok ? 'status' : 'alert'} className="small" style={{ margin: 0 }}>{msg.text}</p>}
  </Card>;
}

// ---------- Profile and privacy (DUPR lives here) ----------

function StudioProfile({ data, reload, b }: SectionProps) {
  const [kind, setKind] = useState<RatingKind>('singles');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); setMsg({ ok: true, text: ok }); reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  function download() {
    const { players, logs, sessions, ratings, settings } = data;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), players, logs, sessions, ratings, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `paddleq-player-studio-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    <Card title="DUPR rating">
      <Seg label="Rating type" value={kind} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={setKind} />
      <RatingPanel key={kind} kind={kind} data={data} busy={busy} run={run} />
      <button type="button" className="btn btn-outline" disabled aria-describedby="dupr-soon">Sign in with DUPR</button>
      <p id="dupr-soon" className="small muted" style={{ margin: 0 }}>Coming later, once DUPR approves RallyQ. Until then, type your rating from the DUPR app. RallyQ never calculates ratings.</p>
    </Card>
    <Card title="Your claimed results">
      {data.players.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing claimed yet. Open the claim link from your organiser to add your official matches.</p>}
      {data.players.map((p) => <div key={p.playerId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span><b>{p.name}</b> · {p.club}{p.claimedAt ? <span className="small muted"> · claimed {friendlyDate(p.claimedAt.slice(0, 10))}</span> : null}</span>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { if (window.confirm(`Undo your claim on ${p.name} at ${p.club}? Their matches leave your Player Studio.`)) void run(() => b.unclaimPlayer(p.playerId), 'Claim undone.'); }}>Not me</button>
      </div>)}
      <label className="pq-check"><input type="checkbox" checked={data.settings.useOfficial} disabled={busy}
        onChange={(e) => void run(() => b.saveStudioSettings({ ...data.settings, useOfficial: e.target.checked }), e.target.checked ? 'Stats and Coach now include official results.' : 'Stats and Coach now use your diary only.')} />
        Use official results in Stats and Coach</label>
    </Card>
    <Card title="Privacy">
      <ul className="small pq-plain-list">
        <li>Your diary (practice, casual games, ratings, goals) is private. Only you can see it. Clubs never see it.</li>
        <li>Official results belong to the club that ran the event. They’re read-only here; ask the organiser to correct a score.</li>
        <li>When you claim, the club sees that its player is linked to an account. Not your email, and not your diary.</li>
      </ul>
      <button type="button" className="btn btn-outline" onClick={download}>Download my data</button>
      <label>To delete your whole diary, type DELETE<input className="input" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} autoComplete="off" /></label>
      <button type="button" className="btn pq-danger" disabled={busy || confirmDelete !== 'DELETE'} onClick={() => void run(async () => { await b.deleteMyDiary(); setConfirmDelete(''); }, 'Your diary was deleted.')}>Delete my diary</button>
    </Card>
  </>;
}

function RatingPanel({ kind, data, busy, run }: { kind: RatingKind; data: StudioData; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const b = serverBackend()!;
  const history = ratingHistory(kind, data);
  const prefill = ratingPrefill(kind, data);
  const [value, setValue] = useState(prefill !== undefined ? fmtRating(prefill) : '');
  const [date, setDate] = useState(today());
  const label = kind === 'singles' ? 'Singles' : 'Doubles';
  const latest = history[0];
  const fromOrganiser = latest?.source === 'organiser' && !history.some((h) => h.source === 'you');
  return <div className="section" aria-label={`${label} DUPR`}>
    <p className="pq-big-number" aria-label={`${label} DUPR ${latest ? fmtRating(latest.value) : 'not set'}`}>{latest ? fmtRating(latest.value) : '—'}</p>
    {fromOrganiser && <p className="small muted" style={{ margin: 0 }}>From the entry list at {latest.club}. Check it against the DUPR app and save your own reading.</p>}
    <form className="pq-rating-form" onSubmit={(e) => { e.preventDefault(); void run(() => b.saveStudioRating({ kind, value: Number(value), rated_on: date }), `${label} rating saved.`); }} aria-label={`Add ${label.toLowerCase()} reading`}>
      <label>{label} DUPR<input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="3.500" /></label>
      <label>Read on<input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
      <button type="submit" className="btn btn-primary" disabled={busy || !value}>Save reading</button>
    </form>
    <h3 className="pq-kicker">HISTORY</h3>
    {history.length === 0 && <p className="small muted" style={{ margin: 0 }}>No readings yet.</p>}
    <ul className="pq-plain-list" aria-label={`${label} rating history`}>
      {history.map((h) => <li key={h.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span><b>{fmtRating(h.value)}</b> <span className="small muted">· {friendlyDate(h.date)} · {h.source === 'you' ? 'you' : `organiser, ${h.club}`}</span></span>
        {h.source === 'you' && <button type="button" className="link-btn" disabled={busy} aria-label={`Delete reading ${fmtRating(h.value)} from ${friendlyDate(h.date)}`} onClick={() => void run(() => b.deleteStudioRating(h.id), 'Reading deleted.')}>Delete</button>}
      </li>)}
    </ul>
  </div>;
}
