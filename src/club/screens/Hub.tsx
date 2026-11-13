import { useEffect, useState, type ReactNode } from 'react';
import { Field } from '../../components/Controls';
import type { NewMatch } from '../../db/matches';
import type { Go } from '../../navigation';
import { clubMode, clubServerConfig, isClubApp, setClubMode } from '../config';
import { backend, demoBackend, serverBackend, takeReturn } from '../index';
import { emailOk, MIN_PASSWORD, passwordProblem } from '../authText';
import { joinPhone, PhoneField, phoneProblem } from './Phone';
import { clubMark, PageHead, PublicShell } from '../../rallyq/shell/Shell';
import { Legacy } from './InboxLegacy';
import type { AdminClub, ClubBackend, MyClub, TournamentAccess } from '../backend';
import { PinPair } from './Access';
import { GO_LIVE_NOTE, isApproved, isStaff, ROLE_LABEL, type ClubTournament } from '../types';
import { appLink, DemoNote, errorText, Header, RoleBadge, shareLink, Status, useLoad } from './common';
import { friendlyTime, relativeDate } from '../dates';
import { TodayAndUpcoming } from '../../clubApp/Tabs';
import { landingAfterSignIn } from '../landing';

const PENDING_JOIN = 'pq-club-pending-join';
// localStorage, not sessionStorage: the email's sign-in link opens in a new tab.
const readPendingJoin = () => { try { return localStorage.getItem(PENDING_JOIN); } catch { return null; } };
const writePendingJoin = (v: string | null) => { try { if (v) localStorage.setItem(PENDING_JOIN, v); else localStorage.removeItem(PENDING_JOIN); } catch { /* private mode */ } };

export function ClubHub({ go, onBack }: { go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) return null;
    const user = await b.currentUser();
    if (!user) return null;
    // RallyQ (the club-only app) has no personal history to add club matches to.
    const [clubs, pending] = await Promise.all([b.myClubs(), isClubApp() ? [] as NewMatch[] : import('../personal').then((m) => m.pendingClubMatches(b)).catch(() => [] as NewMatch[])]);
    const next = isClubApp() ? await nextTournament(b, clubs).catch(() => null) : null;
    // RallyQ admins: this page is "Clubs", with every club on RallyQ (logos, approval state) under their own.
    const admin = isClubApp() ? await b.isPlatformAdmin().catch(() => false) : false;
    const all = admin ? (await b.adminClubs().catch(() => [] as AdminClub[])).filter((c) => !c.isTest) : [];
    const toApprove = admin ? (await b.approvalQueue().catch(() => [])).filter((q) => q.approval === 'submitted').length : 0;
    return { user, clubs, pending, next, admin, all, toApprove };
  }, [b]);
  const [msg, setMsg] = useState<string | null>(null);
  const [demoName, setDemoName] = useState('');
  const [busy, setBusy] = useState(false);
  const server = clubServerConfig();

  async function startDemo() {
    setBusy(true);
    try {
      const id = await demoBackend().start(demoName || 'You');
      setClubMode('demo');
      go('club-view', id);
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  async function addPending(list: NewMatch[]) {
    // The personal app's database is loaded only in the personal app's Club mode, never in RallyQ.
    const n = await (await import('../personal')).importClubMatches(list);
    setMsg(`Added ${n} club ${n === 1 ? 'match' : 'matches'} to your history.`);
    state.reload();
  }
  async function signOut() {
    if (b?.kind === 'demo') demoBackend().reset(); else await b?.signOut();
    setClubMode(null);
    state.reload();
  }

  const signedIn = state.data;
  // RallyQ (the club app): signed out, My club is the sign-in page, so rallyq.in opens on it.
  if (isClubApp() && server && !state.loading && !state.error && !signedIn) return <ClubSignIn go={go} onBack={onBack} landing onSignedIn={state.reload} />;
  if (signedIn && isClubApp()) return (
    <PublicShell go={go} active="clubs" host={signedIn.clubs.length === 1 ? { marks: [clubMark(signedIn.clubs[0].club.name)], name: signedIn.clubs[0].club.name, cap: 'Hosted by' } : undefined}>
      <PageHead cap={b?.kind === 'demo' ? 'Demo mode' : `Signed in as ${signedIn.user.email}`} title={<span id="club-title">{signedIn.admin ? 'Clubs' : 'My clubs'}</span>}
        actions={<>
          {signedIn.admin && <button type="button" className="btn ghost sm" onClick={() => go('admin', 'overview')}>Admin dashboard</button>}
          <button type="button" className="btn ghost sm" onClick={() => signedIn.admin ? go('admin', 'results') : go('club-results')}>Results &amp; DUPR</button>
          {b?.kind === 'server' && <button type="button" className="btn ghost sm" onClick={() => go('club-player-studio')}>Player Studio</button>}
        </>} />
      <Legacy><DemoNote b={b} /></Legacy>
      {msg && <div role="status" className="note">{msg}</div>}
      {signedIn.admin && signedIn.toApprove > 0 && (
        <button type="button" className="card between" style={{ padding: '16px 20px', minHeight: 56, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }} onClick={() => go('admin', 'approvals')}>
          <b>{signedIn.toApprove} tournament{signedIn.toApprove === 1 ? '' : 's'} waiting for your approval</b><span className="st wait">Review</span>
        </button>
      )}
      {signedIn.next && b && <NextTournament n={signedIn.next} go={go} b={b} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TodayAndUpcoming go={go} />
          <section className="card" aria-label="Your clubs">
            <div className="between" style={{ padding: '16px 18px 4px' }}><h2 className="cap" style={{ margin: 0 }}>Your clubs</h2>{b?.kind === 'server' && signedIn.clubs.length > 0 && <button type="button" className="tlink" style={{ fontSize: 13 }} onClick={() => go('club-new')}>Create a club →</button>}</div>
            <div className="list">
              {signedIn.clubs.length === 0 && <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                {b?.kind === 'server' && <button type="button" className="btn" onClick={() => go('club-new')}>Create your club</button>}
                <span>Playing? Open the invite link your club sent.</span>
              </div>}
              {signedIn.clubs.map(({ club, role }) => (
                <button key={club.id} type="button" onClick={() => go('club-view', club.id)}>
                  {club.logoUrl ? <img src={club.logoUrl} alt={`${club.name} logo`} className="tile lg" style={{ objectFit: 'cover', padding: 0 }} /> : <span role="img" aria-label={`${club.name} logo`} className="tile lg">{clubMark(club.name)}</span>}
                  <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{club.name}</b><span className="mut" style={{ fontSize: 13 }}>{[club.city, ROLE_LABEL[role]].filter(Boolean).join(' · ')}</span></span>
                  {club.trusted ? <span className="st ok">Trusted</span> : null}
                  <span aria-hidden="true" className="mut">›</span>
                </button>
              ))}
            </div>
          </section>
          {signedIn.admin && <AllClubs all={signedIn.all} mine={new Set(signedIn.clubs.map((c) => c.club.id))} go={go} />}
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {b?.kind === 'demo' && <DemoTour go={go} clubId={signedIn.clubs[0]?.club.id} />}
          {b?.kind === 'server' && <section className="card" style={{ padding: 18 }}><Legacy><MyPasswordCard /></Legacy></section>}
          <button type="button" className="tlink mut" style={{ alignSelf: 'flex-start' }} onClick={signOut}>
            {b?.kind === 'demo' ? 'Close the demo and delete it from this phone' : 'Sign out'}
          </button>
        </div>
      </div>
    </PublicShell>
  );
  return (
    <main className="screen" aria-labelledby="club-title">
      <Header id="club-title" title={isClubApp() ? (state.data?.admin ? 'Clubs' : 'My clubs') : 'Club'} onBack={isClubApp() ? undefined : onBack} />
      <Status error={state.error} loading={state.loading && !signedIn} />
      {!state.loading && !signedIn && (
        <>
          {isClubApp() ? (
            <section className="card section" aria-label="About RallyQ">
              <h2 style={{ fontSize: 18 }}>Run your club’s tournaments</h2>
              <p className="small" style={{ margin: 0 }}>Entries (or import them from a Google Form), the draw, a scorer on every court with a PIN link, and live results anyone can open.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Organisers sign in with email and password. Referees use their court link and the referee PIN; the desk team uses the desk link and its own desk PIN. Players don’t need an account.</li>
                <li>Joining a club? Open the invite link the club sent you, or paste it below.</li>
              </ul>
            </section>
          ) : (
            <section className="card section" aria-label="About Club mode">
              <h2 style={{ fontSize: 18 }}>Play with your club</h2>
              <p className="small" style={{ margin: 0 }}>Run club tournaments with live scoring, and give coaches a view of where each player wins and loses points.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Your personal RallyQ stays on this phone. Nothing is shared unless you choose.</li>
                <li>Club matches you play can be added to your own history.</li>
                <li>Signing in is only needed for Club mode.</li>
              </ul>
            </section>
          )}
          {server && <button type="button" className="btn btn-primary" onClick={() => go('club-signin')}>Sign in</button>}
          {isClubApp() && <JoinByLink go={go} />}
          {!isClubApp() && <section className="card section" aria-label="Demo club">
            <h2 style={{ fontSize: 18 }}>Try the demo club</h2>
            <p className="small muted" style={{ margin: 0 }}>PQ Demo Club: 56 made-up players and a tournament with 20 singles players and 24 doubles teams. It stays on this phone.</p>
            <label className="label" htmlFor="demo-name">Your name in the demo</label>
            <input id="demo-name" className="input" value={demoName} onChange={(e) => setDemoName(e.target.value)} placeholder="You" maxLength={40} />
            <button type="button" className="btn btn-outline" disabled={busy} onClick={startDemo}>Open PQ Demo Club</button>
          </section>}
        </>
      )}
      {signedIn && !isClubApp() && (
        <>
          <DemoNote b={b} />
          <p className="small muted" style={{ margin: 0 }}>{b?.kind === 'demo' ? 'Demo mode' : `Signed in as ${signedIn.user.email}`}</p>
          {signedIn.pending.length > 0 && (
            <button type="button" className="banner-btn" onClick={() => addPending(signedIn.pending)}>
              <span>{signedIn.pending.length} club {signedIn.pending.length === 1 ? 'match' : 'matches'} to add to your history</span><span>Add ›</span>
            </button>
          )}
          {msg && <div role="status" className="msg msg-ok">{msg}</div>}
          <section className="section" aria-label="Your clubs">
            {signedIn.clubs.length === 0 && <p className="small muted">You’re not in a club yet. Create one, or open an invite link from your club.</p>}
            {signedIn.clubs.map(({ club, role }) => (
              <button key={club.id} type="button" className="match-row" onClick={() => go('club-view', club.id)}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{club.name}</span>
                  {club.city && <span className="small muted">{club.city}</span>}
                </span>
                <RoleBadge role={role} />
              </button>
            ))}
          </section>
          {b?.kind === 'server' && <MyPasswordCard />}
          {b?.kind === 'server' && <button type="button" className="btn btn-outline" onClick={() => go('club-new')}>Create a club</button>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={signOut}>
            {b?.kind === 'demo' ? 'Close the demo and delete it from this phone' : isClubApp() ? 'Sign out' : 'Sign out of Club mode'}
          </button>
        </>
      )}
    </main>
  );
}

interface NextT { t: ClubTournament; club: string; access: TournamentAccess | null }

/** The next tournament (live first, then the soonest not finished) across the clubs I run. */
async function nextTournament(b: ClubBackend, clubs: MyClub[]): Promise<NextT | null> {
  const mine = clubs.filter((c) => isStaff(c.role)).slice(0, 5);
  const bundles = await Promise.all(mine.map((c) => b.clubBundle(c.club.id).catch(() => null)));
  const all = bundles.flatMap((d) => (d ? d.tournaments.filter((t) => t.status !== 'done').map((t) => ({ t, club: d.club.name })) : []));
  all.sort((x, y) => (x.t.status === 'live' ? 0 : 1) - (y.t.status === 'live' ? 0 : 1) || x.t.startDate.localeCompare(y.t.startDate));
  if (!all[0]) return null;
  return { ...all[0], access: await b.tournamentAccess(all[0].t.id).catch(() => null) };
}

/** Admin home: every club on RallyQ with its logo and approval state. Own clubs open their page; others the admin view. */
function AllClubs({ all, mine, go }: { all: AdminClub[]; mine: Set<string>; go: Go }) {
  return (
    <section className="card" aria-label="All clubs on RallyQ">
      <h2 className="cap" style={{ margin: 0, padding: '16px 18px 4px' }}>All clubs on RallyQ ({all.length})</h2>
      <div className="list">
        {all.map((c) => (
          <button key={c.id} type="button" onClick={() => go(mine.has(c.id) ? 'club-view' : 'admin-club', c.id)}>
            {c.logoUrl ? <img src={c.logoUrl} alt={`${c.name} logo`} className="tile lg" style={{ objectFit: 'cover', padding: 0 }} /> : <span role="img" aria-label={`${c.name} logo`} className="tile lg">{clubMark(c.name)}</span>}
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{c.name}</b>
              <span className="mut" style={{ fontSize: 13, display: 'block' }}>{[c.city, `${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
              <span className="mut" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{c.owners.join(', ') || 'No owner email'}</span></span>
            {c.trusted && <span className="st ok">Trusted</span>}
            <span aria-hidden="true" className="mut">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** In the demo (opened by an admin): a short tour of the club workflow and each dashboard, all with made-up data. */
function DemoTour({ go, clubId }: { go: Go; clubId?: string }) {
  const steps: { title: string; text: string; to: () => void }[] = [
    { title: '1 · A club submits a tournament', text: 'PQ Demo Courtyard Club set up its doubles night and sent it for approval.', to: () => go('admin', 'approvals') },
    { title: '2 · You approve it (admin)', text: 'Admin → Approvals: Approve, or Reject with a reason the club sees. Trusted clubs skip this.', to: () => go('admin', 'approvals') },
    { title: '3 · The organiser’s dashboard', text: 'Their club page: logo, tournaments, players and members.', to: () => (clubId ? go('club-view', clubId) : go('club')) },
    { title: '4 · Tournaments on the Events page', text: 'Posters and club logos; players enter in the app.', to: () => go('events') },
    { title: '5 · The admin overview', text: 'Matches scored, clubs and tournaments at a glance.', to: () => go('admin', 'overview') },
  ];
  return (
    <section className="card" aria-label="Demo tour">
      <div style={{ padding: '16px 18px 4px' }}><h2 className="cap" style={{ margin: 0 }}>Demo tour</h2><p className="mut" style={{ margin: '6px 0 0', fontSize: 13 }}>Made-up clubs, players and tournaments on this phone. Tap a step to see that screen.</p></div>
      <div className="list">
        {steps.map((s) => (
          <button key={s.title} type="button" onClick={s.to}>
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block' }}>{s.title}</b><span className="mut" style={{ fontSize: 13 }}>{s.text}</span></span>
            <span aria-hidden="true" className="mut">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** The maroon card on My club: the next tournament, with the desk, entries, referee links and results one tap away. */
function NextTournament({ n, go, b }: { n: NextT; go: Go; b: ClubBackend }) {
  const { t } = n;
  const [msg, setMsg] = useState<string | null>(null);
  const [pins, setPins] = useState(n.access);
  const when = relativeDate(t.startDate);
  const icon = (d: string) => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
  return (
    <section className="card" aria-label="Next tournament" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="between"><span className={t.status === 'live' ? 'chip live' : 'cap'}>{t.status === 'live' ? 'Live now' : 'Next tournament'}</span><span className="mut" style={{ fontSize: 13 }}>{n.club}</span></div>
      <div><h2 className="disp" style={{ fontSize: 34, margin: 0 }}>{t.name}</h2><div className="mut" style={{ fontSize: 14, marginTop: 4 }}>{when}{t.startTime ? ` · ${friendlyTime(t.startTime)}` : ''} · {t.courts} court{t.courts === 1 ? '' : 's'}</div></div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {!isApproved(t) && t.approval === 'submitted' && <span className="st wait" style={{ alignSelf: 'center' }}>Waiting for RallyQ</span>}
        {!isApproved(t) && t.approval !== 'submitted' && <button type="button" className="btn" onClick={() => go('club-tournament', t.id)}>Finish setup</button>}
        {isApproved(t) && <button type="button" className="btn" onClick={() => go('club-desk', t.id)}>{icon('M3 4h18v12H3zM8 20h8M12 16v4')}Desk</button>}
        <button type="button" className="btn ghost" onClick={() => go('club-inbox', t.id)}>{icon('M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11h5M19.5 8.5v5')}Entries</button>
        {isApproved(t) && <button type="button" className="btn ghost" onClick={() => go('club-scorers', t.id)}>{icon('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7')}Referee links</button>}
        {isApproved(t) && <button type="button" className="btn ghost" onClick={async () => setMsg(await shareLink(`${t.name}: live results`, appLink(`#/results/${t.publicSlug}`)))}>{icon('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13')}Share results</button>}
      </div>
      {msg && <div role="status" className="note">{msg}</div>}
      {pins && isApproved(t) && <Legacy><PinPair b={b} tournamentId={t.id} access={pins} onChanged={(p) => setPins({ ...pins, ...p })} /></Legacy>}
    </section>
  );
}

/** The demo club on this phone (opened from the admin dashboard): made-up players, nothing sent anywhere. */
/**
 * The demo is for RallyQ admins (Vineeth's decision, 31 Oct 2026): Admin → Overview → Open the demo club. Anyone else opening
 * #/demo is told so. It's a product choice, not a security line: the demo only ever lives on the phone that opens it. The test robot
 * (and local test builds with no club server) may open it; the robot sets a switch in the phone's storage.
 */
async function demoAllowed(): Promise<boolean> {
  const s = serverBackend();
  if (!s || !isClubApp()) return true;
  try { if (localStorage.getItem('pq-demo-robot') === '1') return true; } catch { /* private mode */ }
  if (clubMode() === 'demo' && (await demoBackend().currentUser())) return true;
  return s.isPlatformAdmin().catch(() => false);
}

export function DemoStart({ go, onBack }: { go: Go; onBack: () => void }) {
  const allowed = useLoad(demoAllowed, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (allowed.data === false) {
    return (
      <main className="screen" aria-labelledby="demo-title">
        <Header id="demo-title" title="Demo club" onBack={onBack} />
        <section className="card section" aria-label="Demo club">
          <p style={{ margin: 0 }}>The demo club is for RallyQ admins.</p>
          <p className="small muted" style={{ margin: 0 }}>Running a tournament? Sign in and create your club; RallyQ will help you set up your first event.</p>
          <button type="button" className="btn btn-primary" onClick={() => go('club-signin')}>Sign in</button>
          <button type="button" className="btn btn-outline" onClick={() => go('events')}>See events</button>
        </section>
      </main>
    );
  }
  if (!allowed.data) return <main className="screen" aria-labelledby="demo-title"><Header id="demo-title" title="Demo club" onBack={onBack} /><Status error={allowed.error} loading /></main>;
  async function start() {
    setBusy(true);
    try { const id = await demoBackend().start(name || 'You'); setClubMode('demo'); go('club-view', id); }
    catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="demo-title">
      <Header id="demo-title" title="Demo club" onBack={onBack} />
      <section className="card section" aria-label="Demo club">
        <p className="small muted" style={{ margin: 0 }}>PQ Demo Club: 56 made-up players and a tournament with 20 singles players and 24 doubles teams. It stays on this phone, for showing RallyQ to clubs and for practice. Close it from My club when you’re done.</p>
        <label className="label" htmlFor="demo-name">Your name in the demo</label>
        <input id="demo-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="You" maxLength={40} />
        {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>Open PQ Demo Club</button>
      </section>
    </main>
  );
}

/** Paste an invite link (or its code) to join a club. */
function JoinByLink({ go }: { go: Go }) {
  const [v, setV] = useState('');
  const code = (v.match(/club-join\/([^/?#\s]+)/)?.[1] ?? v.trim()).replace(/[^A-Za-z0-9-]/g, '');
  return (
    <section className="card section" aria-label="Join a club">
      <h2 style={{ fontSize: 18 }}>Join a club</h2>
      <input className="input" aria-label="Invite link or code" placeholder="Paste the invite link" value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="btn btn-outline" disabled={code.length < 4} onClick={() => go('club-join', code)}>Join</button>
    </section>
  );
}

type SignInStep = 'signin' | 'signup' | 'confirm' | 'forgot' | 'reset';

/** Organisers and admins: email + password (at least 8 characters). New accounts confirm their email with a 6-digit
 * code; "Forgot password" sends a code too. `admin` is the RallyQ admin sign-in page: no new accounts, and it only
 * lets platform admins through to the admin dashboard. */
export function ClubSignIn({ go, admin = false, landing = false, onSignedIn }: { go: Go; onBack: () => void; admin?: boolean; landing?: boolean; onSignedIn?: () => void }) {
  const [step, setStep] = useState<SignInStep>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const b = serverBackend();

  async function signedIn() {
    setClubMode('server');
    if (admin) {
      const ok = await b?.isPlatformAdmin().catch(() => false);
      if (!ok) { await b?.signOut(); setMsg({ ok: false, text: 'This account isn’t a RallyQ admin. Organisers sign in on the normal sign-in page.' }); return; }
      go('admin', 'overview', { replace: true });
      return;
    }
    const back = takeReturn();
    if (back) { window.location.replace(back); return; }
    const pending = readPendingJoin();
    if (pending) { writePendingJoin(null); go('club-join', pending, { replace: true }); return; }
    // RallyQ: players open on their Player Studio; people who run a club (and RallyQ admins) on My clubs.
    const to = isClubApp() && b ? await landingAfterSignIn(b) : 'club';
    if (to === 'club-player-studio') go('club-player-studio', undefined, { replace: true });
    else if (onSignedIn) onSignedIn();
    else go('club', undefined, { replace: true });
  }

  // Opened from an older email's sign-in link: finish signing in.
  useEffect(() => {
    if (!b?.finishLinkSignIn) return;
    let alive = true;
    setBusy(true);
    b.finishLinkSignIn().then(
      (done) => { if (alive) { setBusy(false); if (done) void signedIn(); } },
      (e: unknown) => { if (alive) { setBusy(false); setMsg({ ok: false, text: errorText(e) }); } },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);

  function to(next: SignInStep, text?: string) { setStep(next); setMsg(text ? { ok: true, text } : null); setPassword(''); setAgain(''); setCode(''); }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const needEmail = () => { if (!emailOk(email)) { setMsg({ ok: false, text: 'Enter your email address' }); return false; } return true; };
  const newPasswordOk = () => {
    const bad = passwordProblem(password);
    if (bad) { setMsg({ ok: false, text: bad }); return false; }
    if (password !== again) { setMsg({ ok: false, text: 'The two passwords don’t match' }); return false; }
    return true;
  };

  const signIn = () => { if (!needEmail()) return; if (!password) return setMsg({ ok: false, text: 'Enter your password' });
    void run(async () => {
      try { await b?.passwordSignIn?.(email, password); }
      catch (e) { if (/confirm your email/i.test(errorText(e))) { await b?.resendConfirm?.(email); to('confirm', 'We’ve emailed you a new 6-digit code. Enter it below.'); return; } throw e; }
      await signedIn();
    }); };
  const signUp = () => { if (!needEmail() || !newPasswordOk()) return;
    void run(async () => { const needsCode = await b?.signUp?.(email, password); if (needsCode) to('confirm', `We’ve emailed a 6-digit code to ${email.trim()}. Check spam if it isn’t there in a minute.`); else await signedIn(); }); };
  const confirm = () => { if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return setMsg({ ok: false, text: 'Enter the 6-digit code from the email' });
    void run(async () => { await b?.confirmEmail?.(email, code); await signedIn(); }); };
  const forgot = () => { if (!needEmail()) return;
    void run(async () => { await b?.sendPasswordReset?.(email); to('reset', `If ${email.trim()} has an account, we’ve emailed it a 6-digit code.`); }); };
  const reset = () => { if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return setMsg({ ok: false, text: 'Enter the 6-digit code from the email' }); if (!newPasswordOk()) return;
    void run(async () => { await b?.resetPassword?.(email, code, password); await signedIn(); }); };

  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') fn(); };
  const pwOk = { len: password.length >= MIN_PASSWORD, mix: /[A-Za-z]/.test(password) && /\d/.test(password) };
  const showBtn = <button type="button" className="tlink" style={{ minHeight: 44, fontSize: 13 }} aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>;
  const emailField = (
    <div className="fld">
      <label htmlFor="pq-email">Email</label>
      <input id="pq-email" className="inp" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
        onChange={(e) => setEmail(e.target.value)} disabled={step === 'confirm' || step === 'reset'} />
    </div>
  );
  const newPasswordFields = (onEnter: () => void) => (
    <>
      <div className="fld">
        <div className="between"><label htmlFor="pq-new">{step === 'reset' ? 'New password' : 'Choose a password'}</label>{showBtn}</div>
        <input id="pq-new" className="inp" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ul aria-label="Password rules" className="row" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <li className={pwOk.len ? undefined : 'mut'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pwOk.len && <Tick />}{MIN_PASSWORD}+ characters</li>
          <li className={pwOk.mix ? undefined : 'mut'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{pwOk.mix && <Tick />}Letters and numbers</li>
        </ul>
      </div>
      <div className="fld">
        <label htmlFor="pq-again">Type it again</label>
        <input id="pq-again" className="inp" type={show ? 'text' : 'password'} autoComplete="new-password" aria-label="Password again" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={enter(onEnter)} />
      </div>
    </>
  );
  const codeField = (onEnter: () => void) => (
    <div className="fld">
      <label htmlFor="pq-code">6-digit code</label>
      <input id="pq-code" className="inp n" style={{ fontSize: 24, letterSpacing: '.3em' }} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="••••••" value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} onKeyDown={enter(onEnter)} />
      <span className="hint">From RallyQ &lt;hello@rallyq.in&gt;. Works for one hour.</span>
    </div>
  );
  const message = msg && <div role={msg.ok ? 'status' : 'alert'} className="note" style={msg.ok ? undefined : { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--err)' }}>{msg.text}</div>;
  // One ball-yellow button per state: the step's next action.
  const primary = (label: string, busyLabel: string, fn: () => void) => (
    <button type="button" className="btn" style={{ width: '100%' }} disabled={busy || !b} onClick={fn}>{busy ? busyLabel : label}</button>
  );
  const textLink = (label: string, fn: () => void) => <button type="button" className="tlink" onClick={fn}>{label}</button>;
  const back = () => to('signin');
  const mailInfo = <div className="mut" style={{ fontSize: 13 }}>Not there in a minute? Check Spam or Promotions. Keep this screen open: copy the code from your email and come back.</div>;
  const title = (text: ReactNode) => <h2 className="disp" style={{ fontSize: 36, margin: 0 }}>{text}</h2>;
  const tabs = !admin && (step === 'signin' || step === 'signup') && (
    <div className="tabs" role="tablist" aria-label="Account">
      {([['signin', 'Sign in'], ['signup', 'Create account']] as const).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={step === k} className={step === k ? 'tab on' : 'tab'} style={{ minHeight: 44 }} onClick={() => step !== k && to(k)}>{label}</button>
      ))}
    </div>
  );

  return (
    <PublicShell go={go} active={admin ? null : 'clubs'} right={<></>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
        <section className="cglass signin-intro" aria-label={admin ? 'RallyQ admin' : 'For clubs and players'} style={{ flex: '1 1 360px', minHeight: 'min(520px, 70vh)', padding: 'clamp(22px, 4vw, 32px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24, borderRadius: 24, minWidth: 0 }}>
          <svg className="lines" viewBox="0 0 440 600" preserveAspectRatio="none" aria-hidden="true" style={{ inset: 24, width: 'calc(100% - 48px)', height: 'calc(100% - 48px)' }}><g><rect x="1" y="1" width="438" height="598" /><line x1="1" y1="300" x2="439" y2="300" strokeWidth="4" /><line x1="1" y1="210" x2="439" y2="210" /><line x1="1" y1="390" x2="439" y2="390" /><line x1="220" y1="1" x2="220" y2="210" /><line x1="220" y1="390" x2="220" y2="599" /></g></svg>
          <span className="cap" style={{ color: '#F1F4EA' }}>{admin ? 'For RallyQ admins only' : 'For clubs and players'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h1 id="signin-title" className="disp" style={{ fontSize: 'clamp(40px, 5vw, 72px)', margin: 0 }}>{admin ? 'RallyQ admin' : <>Your court.<br />The main event.</>}</h1>
            <div style={{ color: '#DDEBDF', maxWidth: 440 }}>{admin ? 'Approvals, clubs and listings. Organisers sign in on the normal sign-in page.' : 'One account. Organisers run the day, players keep their Player Studio. Referees don’t need one: they open the link from the desk.'}</div>
          </div>
        </section>

        <section className="card signin-form" aria-label="Account" style={{ flex: '1 1 420px', padding: 'clamp(20px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {tabs}
          {!b && <div role="alert" className="note"><b>Not available: </b>The club server isn’t set up in this version.</div>}

          {step === 'signin' && (
            <div className="form">
              {title(admin ? 'Admin sign in.' : 'Welcome back.')}
              {emailField}
              <div className="fld">
                <div className="between">
                  <label htmlFor="pq-password">Password</label>
                  <span className="row" style={{ gap: 14 }}>{showBtn}<button type="button" className="tlink" style={{ minHeight: 44, fontSize: 13 }} onClick={() => to('forgot')}>Forgot password?</button></span>
                </div>
                <input id="pq-password" className="inp" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={enter(signIn)} />
              </div>
              {message}
              {primary('Sign in', 'Signing in…', signIn)}
              {landing && !admin && <MoreWays go={go} />}
            </div>
          )}
          {step === 'signup' && (
            <div className="form">
              {title('Start on RallyQ.')}
              {emailField}
              {newPasswordFields(signUp)}
              {message}
              {primary('Create account', 'Creating…', signUp)}
              <div className="mut" style={{ fontSize: 13 }}>We email you a 6-digit code to confirm it’s really you. Then create your club and prepare a tournament. RallyQ approves each tournament before it goes live; trusted clubs skip that step.</div>
            </div>
          )}
          {step === 'confirm' && (
            <div className="form">
              {title('Check your email')}
              <div className="mut">We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{email.trim()}</b></div>
              {message}
              {codeField(confirm)}
              {primary('Confirm and sign in', 'Checking…', confirm)}
              <div className="between" style={{ flexWrap: 'wrap' }}>
                {textLink('Send a new code', () => void run(async () => { await b?.resendConfirm?.(email); setMsg({ ok: true, text: 'New code sent. Only the newest code works.' }); }))}
                {textLink('Use a different email', () => to('signup'))}
              </div>
              {mailInfo}
            </div>
          )}
          {step === 'forgot' && (
            <div className="form">
              {title('Reset your password.')}
              <div className="mut">We’ll email you a 6-digit code.</div>
              {emailField}
              {message}
              {primary('Email me a code', 'Sending…', forgot)}
              {textLink('← Back to sign in', back)}
            </div>
          )}
          {step === 'reset' && (
            <div className="form">
              {title('Reset your password.')}
              <div className="mut">We sent a code to <b style={{ color: 'var(--ink)' }}>{email.trim()}</b></div>
              {message}
              {codeField(reset)}
              {newPasswordFields(reset)}
              {primary('Save password and sign in', 'Saving…', reset)}
              <div className="between" style={{ flexWrap: 'wrap' }}>
                {textLink('Send a new code', () => void run(async () => { await b?.sendPasswordReset?.(email); setMsg({ ok: true, text: 'New code sent. Only the newest code works.' }); }))}
                {textLink('← Back to sign in', back)}
              </div>
              {mailInfo}
            </div>
          )}
          {!admin && <div className="note">Referee or desk helper? Open the link your organiser sent you. No account needed.</div>}
        </section>
      </div>
    </PublicShell>
  );
}

function Tick() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>;
}

/** Below the sign-in on rallyq.in: join a club by its invite link. */
function MoreWays({ go }: { go: Go }) {
  const [joining, setJoining] = useState(false);
  const [v, setV] = useState('');
  const code = (v.match(/club-join\/([^/?#\s]+)/)?.[1] ?? v.trim()).replace(/[^A-Za-z0-9-]/g, '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <button type="button" className="tlink" aria-expanded={joining} onClick={() => setJoining(!joining)}>
        <span><b>Got an invite from a club?</b> Join it</span>
        <span aria-hidden="true">{joining ? '⌄' : '›'}</span>
      </button>
      {joining && (
        <section aria-label="Join a club" className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input className="inp" style={{ flex: '1 1 200px' }} aria-label="Invite link or code" placeholder="Paste the invite link" value={v} onChange={(e) => setV(e.target.value)} />
          <button type="button" className="btn ghost" disabled={code.length < 4} onClick={() => go('club-join', code)}>Join</button>
        </section>
      )}
    </div>
  );
}

/** Signed in on the club server: set or change your password. */
function MyPasswordCard() {
  const b = serverBackend();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const bad = passwordProblem(pw);
    if (bad) return setMsg({ ok: false, text: bad });
    if (pw !== again) return setMsg({ ok: false, text: 'The two passwords don’t match' });
    setBusy(true); setMsg(null);
    try { await b?.setMyPassword?.(pw); setMsg({ ok: true, text: 'Password saved. Next time, sign in with your email and this password.' }); setOpen(false); setPw(''); setAgain(''); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="card section" aria-label="Your password">
      <h2 style={{ fontSize: 18 }}>Your password</h2>
      <p className="small muted" style={{ margin: 0 }}>You sign in with your email and password. Keep it to yourself.</p>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {!open && <button type="button" className="btn btn-outline" onClick={() => { setOpen(true); setMsg(null); }}>Set or change my password</button>}
      {open && (
        <>
          <Field label={`New password (${MIN_PASSWORD}+ characters, letters and numbers)`}>
            <input className="input" type="password" autoComplete="new-password" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Field label="Type it again">
            <input className="input" type="password" autoComplete="new-password" aria-label="New password again" value={again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Save password</button>
            <button type="button" className="btn btn-outline" onClick={() => { setOpen(false); setPw(''); setAgain(''); }}>Cancel</button>
          </div>
        </>
      )}
    </section>
  );
}

type ClubField = 'name' | 'me' | 'phone';
const FIELD_ERROR = { color: 'var(--coral, #FF655C)', fontSize: 13, margin: '4px 0 0' } as const;

export function ClubNew({ go, onBack }: { go: Go; onBack: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [me, setMe] = useState('');
  const [country, setCountry] = useState('+91');
  const [digits, setDigits] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<{ field?: ClubField; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Set once the club exists but its contact number didn't save: retry the number, never create a second club.
  const [madeId, setMadeId] = useState<string | null>(null);
  function fail(field: ClubField | undefined, text: string) {
    setErr({ field, text });
    if (field) document.getElementById(`newclub-${field}`)?.focus();
  }
  async function saveContact(b: ClubBackend, id: string) {
    try {
      await b.requestHosting(id, joinPhone(country, digits), note);
      go('club-view', id, { replace: true });
    } catch (e) { setMadeId(id); fail('phone', `Your club is created, but the phone number didn’t save: ${errorText(e)}`); setBusy(false); }
  }
  async function create() {
    const b = backend();
    if (!b) return go('club');
    if (!madeId && name.trim().length < 2) return fail('name', 'Give the club a name');
    if (!madeId && !me.trim()) return fail('me', 'Add your name, as players will see it');
    const bad = phoneProblem(country, digits);
    if (bad) return fail('phone', bad);
    setErr(null);
    setBusy(true);
    if (madeId) return saveContact(b, madeId);
    let id: string;
    try { id = await b.createClub(name, city, me); } catch (e) { fail(undefined, errorText(e)); setBusy(false); return; }
    await saveContact(b, id);
  }
  const invalid = (f: ClubField) => (err?.field === f ? { 'aria-invalid': true, 'aria-describedby': `newclub-${f}-error` } : {});
  const below = (f: ClubField) => err?.field === f && <p id={`newclub-${f}-error`} role="alert" style={FIELD_ERROR}>{err.text}</p>;
  return (
    <PublicShell go={go} active="clubs">
      <PageHead cap="For clubs" title={<span id="newclub-title">Create a club</span>} sub="Your club’s name and logo come first on event pages, scores and results. RallyQ stays in the background." actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />
      <section className="card" style={{ padding: 22, maxWidth: 640 }}><Legacy style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Club name"><input id="newclub-name" className="input" aria-label="Club name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!!madeId} {...invalid('name')} />{below('name')}</Field>
      <Field label="City (optional)"><input className="input" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} disabled={!!madeId} /></Field>
      <Field label="Your name"><input id="newclub-me" className="input" aria-label="Your name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={60} disabled={!!madeId} {...invalid('me')} />{below('me')}</Field>
      <div><PhoneField id="newclub-phone" invalid={err?.field === 'phone'} country={country} digits={digits} onChange={(c, d) => { setCountry(c); setDigits(d); }} />{below('phone')}</div>
      <Field label="About your club (optional)"><textarea className="input" aria-label="About your club" rows={3} placeholder="Where you play, how many courts, tournaments you plan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      <p className="small muted" style={{ margin: 0 }}>You’ll be the owner. {GO_LIVE_NOTE} RallyQ may call or WhatsApp you on this number.</p>
      {err && !err.field && <div role="alert" style={FIELD_ERROR}>{err.text}</div>}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" disabled={busy} onClick={create}>{madeId ? 'Save number again' : 'Create club'}</button>
        {madeId && <button type="button" className="tlink" onClick={() => go('club-view', madeId, { replace: true })}>Open my club</button>}
      </div>
      </Legacy></section>
    </PublicShell>
  );
}

/** Opened from an invite link: #/club-join/<invite code>~<player code> */
export function ClubJoin({ code, go, onBack }: { code: string; go: Go; onBack: () => void }) {
  const [invite, claim] = code.split('~');
  const b = backend();
  const user = useLoad(async () => (b ? b.currentUser() : null), [b]);
  const [me, setMe] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const server = clubServerConfig();

  async function join() {
    if (!b) return;
    if (!me.trim() && !claim) return setMsg('Add your name, as your club will see it');
    setBusy(true);
    try { go('club-view', await b.joinClub(invite, claim || null, me), { replace: true }); } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }
  function signInFirst() {
    writePendingJoin(code);
    go('club-signin');
  }
  return (
    <main className="screen" aria-labelledby="join-title">
      <Header id="join-title" title="Join a club" onBack={onBack} />
      <section className="card section">
        <p style={{ margin: 0 }}>You’ve been invited to join a club in RallyQ.</p>
        <p className="small muted" style={{ margin: 0 }}>Joining shares your name and the club matches you play with that club. Your practice diary, goals and coach notes stay private unless you choose to share them.</p>
      </section>
      {user.data === null && !user.loading && (server
        ? <button type="button" className="btn btn-primary" onClick={signInFirst}>Sign in to join</button>
        : <div role="alert" className="msg msg-bad">Joining needs the club server, which isn’t set up in this version.</div>)}
      {user.data && (
        <>
          {!claim && <Field label="Your name"><input className="input" aria-label="Your name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={60} /></Field>}
          {msg && <div role="status" className="msg msg-bad">{msg}</div>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={join}>Join club</button>
        </>
      )}
    </main>
  );
}
