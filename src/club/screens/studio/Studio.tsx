import { useState, type FormEvent } from 'react';
import type { Go } from '../../../navigation';
import { eventsBackend, rememberReturn, serverBackend } from '../../index';
import { friendlyDate } from '../../dates';
import { fmtRating } from '../../../domain/record';
import {
  ALL_TIME, GOAL_LABEL, goalProgress, homeStory, ratingHistory, ratingPrefill, studioCoach, studioStats,
  type GoalKind, type RatingKind, type StudioData, type StudioGoal,
} from '../../playerStudio';
import { errorText, Header, Status, useLoad } from '../common';
import { Card, Evidence, plural, Seg, today, type SectionProps } from './shared';
import { StudioMatches } from './StudioMatches';
import { drillNames, StudioTrain } from './StudioTrain';
import { StudioCoach, StudioStats } from './StudioInsights';
import { RecapShare } from './Recap';
import { Intro, Kpi, Panel } from '../Dash';

export const STUDIO_SECTIONS = [
  { id: 'home', label: 'Home' }, { id: 'matches', label: 'Matches' }, { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' }, { id: 'coach', label: 'Coach' }, { id: 'profile', label: 'Profile' },
] as const;

/** Player Studio: your official PaddleQ results (read-only) and your private diary. Sections in a strip on phones, a side rail on laptops. */
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
  return (
    <main className="screen wide-ok pq-studio" aria-labelledby="studio-title">
      <Header id="studio-title" title="Player Studio" />
      <Status loading={state.loading && !d} error={state.error} />
      {!b && <p className="small muted">Player Studio needs the PaddleQ server. It isn’t available in the demo club.</p>}
      {b && !state.loading && !state.error && !d && <section className="card section" aria-label="Sign in">
        <h2>Your game, in one place</h2>
        <p className="small" style={{ margin: 0 }}>See your official tournament results, and keep a private diary of practice and casual games.</p>
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
  return <>
    <Intro kicker="PaddleQ Player Studio" sub="Your official tournament results, your progress and your practice, in one calm place." />
    <div className="pq-panels">
      <section className="pq-panel" aria-label="You">
        <div className="pq-player-head">
          <span className="pq-player-ini" aria-hidden="true">{initials}</span>
          <div style={{ minWidth: 0 }}>
            <span className="pq-kick" style={{ margin: 0 }}>Player Studio{me ? ` · ${me.club}` : ''}</span>
            <div className="pq-player-name">{me?.name ?? 'Your Player Studio'}</div>
            <div className="small muted">{[me?.club, kinds.join(' · ') || undefined, claimed ? 'Official results claimed' : 'Results not claimed yet'].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <section className="pq-band pq-band-tall" aria-label="Your latest">
          <div style={{ minWidth: 0 }}>
            <div className="pq-band-kick">PADDLEQ · OUT OF THE KITCHEN, INTO THE STATS.</div>
            <div className="pq-band-name">Good to see you on court.</div>
            <p className="pq-story-text" style={{ margin: '6px 0 14px' }}>{homeStory(data)}</p>
            <div className="pq-actions">
              <button type="button" className="btn-cream" onClick={() => go('club-player-studio', 'matches')}>Explore recent matches</button>
              <button type="button" className="btn-cream" onClick={() => go('club-player-studio', 'practice')}>Log practice</button>
              <button type="button" className="btn-cream" onClick={() => go('club-player-studio', 'log')}>Log a match</button>
            </div>
          </div>
        </section>
      </section>
      <Panel title="Season snapshot">
        <div className="pq-snap"><span>Official matches</span><b>{off.length}</b></div>
        <div className="pq-snap"><span>Wins</span><b>{wins}</b></div>
        <div className="pq-snap"><span>Win rate</span><b>{off.length ? `${((100 * wins) / off.length).toFixed(1)}%` : '—'}</b></div>
        <div className="pq-snap"><span>Formats</span><b>{kinds.join(' · ') || '—'}</b></div>
        <div className="pq-snap"><span>Singles DUPR</span><b>{st.singlesRating !== undefined ? fmtRating(st.singlesRating) : '—'}</b></div>
        <div className="pq-snap"><span>Doubles DUPR</span><b>{st.doublesRating !== undefined ? fmtRating(st.doublesRating) : '—'}</b></div>
      </Panel>
    </div>
    <div className="pq-kpis">
      <Kpi label="Recent form" value={form.length ? form.join(' · ') : '—'} sub="Last four official matches" onClick={() => go('club-player-studio', 'matches')} />
      <Kpi label="Points for" value={pointsFor} sub="Official scores only" onClick={() => go('club-player-studio', 'stats')} />
      <Kpi label="Practice streak" value={plural(st.streak, 'day')} sub={`${st.weekMinutes} min this week`} onClick={() => go('club-player-studio', 'train')} />
      <Kpi label="Upcoming events" value={next.data ? 1 : 0} sub={next.data ? `${next.data.tournament} · ${friendlyDate(next.data.startDate)}` : 'Find one on the Events board'} onClick={() => go(next.data ? 'my-entries' : 'events')} />
    </div>
    {data.official.length > 0 && <RecapShare data={data} />}
    {!claimed && <Card title="Claim your tournament results">
      <p className="small" style={{ margin: 0 }}>Open the claim link your organiser sent you (on WhatsApp or by email). Your official matches then show up here, read-only.</p>
    </Card>}
    <Goals data={data} />
    {coach && <Card title="One thing to look at" action={<Evidence measured={coach.evidence === 'measured'} />}>
      <p style={{ margin: 0 }}>{coach.text}</p>
      <button type="button" className="link-btn" onClick={() => go('club-player-studio', 'coach')}>All coach notes</button>
    </Card>}
    {next.data && <Card title="Next event">
      <p style={{ margin: 0 }}><b>{next.data.tournament}</b> · {next.data.division}</p>
      <p className="small muted" style={{ margin: 0 }}>{next.data.club} · {friendlyDate(next.data.startDate)}{next.data.status !== 'accepted' ? ' · waiting for the organiser' : ''}</p>
      <button type="button" className="link-btn" onClick={() => go('my-entries')}>My entries</button>
    </Card>}
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
      <p id="dupr-soon" className="small muted" style={{ margin: 0 }}>Coming later, once DUPR approves PaddleQ. Until then, type your rating from the DUPR app. PaddleQ never calculates ratings.</p>
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
