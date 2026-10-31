import { useEffect, useState } from 'react';
import { Field } from '../../components/Controls';
import type { NewMatch } from '../../db/matches';
import type { Go } from '../../navigation';
import { clubServerConfig, isClubApp, setClubMode } from '../config';
import { backend, demoBackend, serverBackend, takeReturn } from '../index';
import { importClubMatches, pendingClubMatches } from '../personal';
import { emailOk, MIN_PASSWORD, passwordProblem } from '../authText';
import { BigLogo } from './Poster';
import { joinPhone, PhoneField, phoneProblem } from './Phone';
import { Arrow, BrandMark, FlowHeader, LandingHero } from './Brand';
import type { AdminClub, ClubBackend, MyClub, TournamentAccess } from '../backend';
import { PinPair } from './Access';
import { canHost, isStaff, ROLE_LABEL, type ClubTournament } from '../types';
import { appLink, DemoNote, errorText, Header, RoleBadge, shareLink, Status, useLoad } from './common';
import { friendlyTime, relativeDate } from '../dates';

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
    // PaddleQ (the club-only app) has no personal history to add club matches to.
    const [clubs, pending] = await Promise.all([b.myClubs(), isClubApp() ? [] as NewMatch[] : pendingClubMatches(b).catch(() => [] as NewMatch[])]);
    const next = isClubApp() ? await nextTournament(b, clubs).catch(() => null) : null;
    // PaddleQ admins: this page is "Clubs", with every club on PaddleQ (logos, approval state) under their own.
    const admin = isClubApp() ? await b.isPlatformAdmin().catch(() => false) : false;
    const all = admin ? (await b.adminClubs().catch(() => [] as AdminClub[])).filter((c) => !c.isTest) : [];
    return { user, clubs, pending, next, admin, all };
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
    const n = await importClubMatches(list);
    setMsg(`Added ${n} club ${n === 1 ? 'match' : 'matches'} to your history.`);
    state.reload();
  }
  async function signOut() {
    if (b?.kind === 'demo') demoBackend().reset(); else await b?.signOut();
    setClubMode(null);
    state.reload();
  }

  const signedIn = state.data;
  // PaddleQ (the club app): signed out, My club is the sign-in page, so paddleq.in opens on it.
  if (isClubApp() && server && !state.loading && !state.error && !signedIn) return <ClubSignIn go={go} onBack={onBack} landing onSignedIn={state.reload} />;
  return (
    <main className="screen" aria-labelledby="club-title">
      <Header id="club-title" title={isClubApp() ? (state.data?.admin ? 'Clubs' : 'My clubs') : 'Club'} onBack={isClubApp() ? undefined : onBack} />
      <Status error={state.error} loading={state.loading && !signedIn} />
      {!state.loading && !signedIn && (
        <>
          {isClubApp() ? (
            <section className="card section" aria-label="About PaddleQ">
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
                <li>Your personal PaddleQ stays on this phone. Nothing is shared unless you choose.</li>
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
      {signedIn && isClubApp() && (
        <>
          <DemoNote b={b} />
          <div className="pq-me">
            <span className="pq-me-email">{b?.kind === 'demo' ? 'Demo mode' : signedIn.user.email}</span>
            <span className="pq-tile"><BrandMark size={30} /></span>
          </div>
          {msg && <div role="status" className="msg msg-ok">{msg}</div>}
          {b?.kind === 'demo' && <DemoTour go={go} clubId={signedIn.clubs[0]?.club.id} />}
          {signedIn.admin && signedIn.all.some((c) => c.hosting === 'pending') && (
            <button type="button" className="banner-btn" onClick={() => go('admin', 'clubs')}>
              <span>{signedIn.all.filter((c) => c.hosting === 'pending').length} club{signedIn.all.filter((c) => c.hosting === 'pending').length === 1 ? '' : 's'} waiting for your approval</span><span>›</span>
            </button>
          )}
          {signedIn.admin && <h2 className="pq-kicker">YOUR CLUBS</h2>}
          <section className="section" aria-label="Your clubs" style={{ gap: 10 }}>
            {signedIn.clubs.length === 0 && (
              <div className="pq-info"><span>You’re not in a club yet. Create your club and ask PaddleQ to host tournaments, or open the invite link your club sent you.</span></div>
            )}
            {signedIn.clubs.map(({ club, role }) => (
              <button key={club.id} type="button" className="pq-club" onClick={() => go('club-view', club.id)}>
                {club.logoUrl ? <img src={club.logoUrl} alt="" className="pq-club-logo" /> : <span aria-hidden="true" className="pq-club-logo">{initials(club.name)}</span>}
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <b style={{ fontSize: 17, overflowWrap: 'anywhere' }}>{club.name}</b>
                  <span className="pq-club-meta">
                    {[club.city, ROLE_LABEL[role]].filter(Boolean).join(' · ')}
                    {canHost(club) ? <span className="pq-badge">Approved</span>
                      : <span className="pq-badge pq-badge-gold">{club.hosting === 'rejected' ? 'NOT APPROVED' : 'WAITING FOR PADDLEQ'}</span>}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 22 }}>›</span>
              </button>
            ))}
          </section>
          {signedIn.next && b && <NextTournament n={signedIn.next} go={go} b={b} />}
          {signedIn.admin && <AllClubs all={signedIn.all} mine={new Set(signedIn.clubs.map((c) => c.club.id))} go={go} />}
          {b?.kind === 'server' && <button type="button" className="btn btn-outline pq-big" onClick={() => go('club-new')}>Create a club</button>}
          {b?.kind === 'server' && <MyPasswordCard />}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={signOut}>
            {b?.kind === 'demo' ? 'Close the demo and delete it from this phone' : 'Sign out'}
          </button>
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

const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w) && !/^the$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'PQ';

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

/** Admin home: every club on PaddleQ with its logo and approval state. Own clubs open their page; others the admin view. */
function AllClubs({ all, mine, go }: { all: AdminClub[]; mine: Set<string>; go: Go }) {
  return (
    <section className="section" aria-label="All clubs on PaddleQ" style={{ gap: 10 }}>
      <h2 className="pq-kicker">ALL CLUBS ON PADDLEQ ({all.length})</h2>
      {all.map((c) => (
        <button key={c.id} type="button" className="pq-club" onClick={() => go(mine.has(c.id) ? 'club-view' : 'admin-club', c.id)}>
          <BigLogo src={c.logoUrl} club={c.name} size={48} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <b style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{c.name}</b>
            <span className="pq-club-meta">
              {[c.city, `${c.tournaments} tournament${c.tournaments === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              {c.hosting === 'approved' ? <span className="pq-badge">Approved</span> : <span className="pq-badge pq-badge-gold">{c.hosting === 'rejected' ? 'NOT APPROVED' : 'WANTS TO HOST'}</span>}
            </span>
            <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{c.owners.join(', ') || 'No owner email'}</span>
          </span>
          <span aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 22 }}>›</span>
        </button>
      ))}
    </section>
  );
}

/** In the demo (opened by an admin): a short tour of the club workflow and each dashboard, all with made-up data. */
function DemoTour({ go, clubId }: { go: Go; clubId?: string }) {
  const steps: { title: string; text: string; to: () => void }[] = [
    { title: '1 · A new club asks to host', text: 'PQ Demo Courtyard Club has sent its request with a phone number and a note.', to: () => go('admin', 'clubs') },
    { title: '2 · You approve it (admin)', text: 'Admin → Clubs: Approve to host, or Reject with a reason the club sees.', to: () => go('admin', 'clubs') },
    { title: '3 · The organiser’s dashboard', text: 'Their club page: logo, tournaments, players and members.', to: () => (clubId ? go('club-view', clubId) : go('club')) },
    { title: '4 · Tournaments on the Events page', text: 'Posters and club logos; players enter in the app.', to: () => go('events') },
    { title: '5 · Listings waiting for review', text: 'A club’s first tournament is checked by you before it goes on the board.', to: () => go('admin', 'listings') },
    { title: '6 · The admin overview', text: 'Matches scored, clubs and tournaments at a glance.', to: () => go('admin', 'overview') },
  ];
  return (
    <section className="card section" aria-label="Demo tour">
      <h2 style={{ fontSize: 18 }}>Demo tour</h2>
      <p className="small muted" style={{ margin: 0 }}>Made-up clubs, players and tournaments on this phone. Tap a step to see that screen.</p>
      {steps.map((s) => (
        <button key={s.title} type="button" className="match-row" onClick={s.to}>
          <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{s.title}</b><span className="small muted">{s.text}</span></span>
          <span aria-hidden="true" style={{ color: 'var(--accent)' }}>›</span>
        </button>
      ))}
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
    <section className="pq-next" aria-label="Next tournament">
      <div className="pq-row-split">
        <span className="pq-next-kicker">{t.status === 'live' ? 'LIVE NOW' : 'NEXT TOURNAMENT'}</span>
        <span className="small" style={{ color: '#EAD8D2' }}>{n.club}</span>
      </div>
      <div>
        <h2>{t.name}</h2>
        <div className="pq-next-meta">{when}{t.startTime ? ` · ${friendlyTime(t.startTime)}` : ''} · {t.courts} court{t.courts === 1 ? '' : 's'}</div>
      </div>
      <div className="pq-next-actions">
        <button type="button" className="pq-next-btn pq-solid" onClick={() => go('club-desk', t.id)}>{icon('M3 4h18v12H3zM8 20h8M12 16v4')}Desk</button>
        <button type="button" className="pq-next-btn" onClick={() => go('club-inbox', t.id)}>{icon('M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M17 11h5M19.5 8.5v5')}Entries</button>
        <button type="button" className="pq-next-btn" onClick={() => go('club-scorers', t.id)}>{icon('M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7')}Referee links</button>
        <button type="button" className="pq-next-btn" onClick={async () => setMsg(await shareLink(`${t.name}: live results`, appLink(`#/results/${t.publicSlug}`)))}>{icon('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13')}Share results</button>
      </div>
      {msg && <div role="status" className="small" style={{ color: '#F3EBDD' }}>{msg}</div>}
      {pins && <PinPair b={b} tournamentId={t.id} access={pins} onChanged={(p) => setPins({ ...pins, ...p })} light />}
    </section>
  );
}

/** The demo club on this phone (opened from the admin dashboard): made-up players, nothing sent anywhere. */
export function DemoStart({ go, onBack }: { go: Go; onBack: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    try { const id = await demoBackend().start(name || 'You'); setClubMode('demo'); go('club-view', id); }
    catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="demo-title">
      <Header id="demo-title" title="Demo club" onBack={onBack} />
      <section className="card section" aria-label="Demo club">
        <p className="small muted" style={{ margin: 0 }}>PQ Demo Club: 56 made-up players and a tournament with 20 singles players and 24 doubles teams. It stays on this phone, for showing PaddleQ to clubs and for practice. Close it from My club when you’re done.</p>
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
 * code; "Forgot password" sends a code too. `admin` is the PaddleQ admin sign-in page: no new accounts, and it only
 * lets platform admins through to the admin dashboard. */
export function ClubSignIn({ go, onBack, admin = false, landing = false, onSignedIn }: { go: Go; onBack: () => void; admin?: boolean; landing?: boolean; onSignedIn?: () => void }) {
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
      if (!ok) { await b?.signOut(); setMsg({ ok: false, text: 'This account isn’t a PaddleQ admin. Organisers sign in on the normal sign-in page.' }); return; }
      go('admin', 'overview', { replace: true });
      return;
    }
    const back = takeReturn();
    if (back) { window.location.replace(back); return; }
    const pending = readPendingJoin();
    if (pending) { writePendingJoin(null); go('club-join', pending, { replace: true }); }
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
      catch (e) { if (/confirm your email/i.test(errorText(e))) { await b?.resendConfirm?.(email).catch(() => undefined); to('confirm', 'We’ve emailed you a new 6-digit code. Enter it below.'); return; } throw e; }
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
  const emailField = (
    <div className="pq-field">
      <label className="pq-label" htmlFor="pq-email">Email</label>
      <input id="pq-email" className="input pq-input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
        onChange={(e) => setEmail(e.target.value)} disabled={step === 'confirm' || step === 'reset'} />
    </div>
  );
  const newPasswordFields = (onEnter: () => void) => (
    <>
      <div className="pq-field">
        <label className="pq-label" htmlFor="pq-new">{step === 'reset' ? 'New password' : 'Choose a password'}</label>
        <div className="pq-pw">
          <input id="pq-new" className="input pq-input" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="pq-show" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <ul className="pq-rules" aria-label="Password rules">
          <li className={pwOk.len ? 'pq-ok' : ''}>{pwOk.len && <Tick />}{MIN_PASSWORD}+ characters</li>
          <li className={pwOk.mix ? 'pq-ok' : ''}>{pwOk.mix && <Tick />}Letters and numbers</li>
        </ul>
      </div>
      <div className="pq-field">
        <label className="pq-label" htmlFor="pq-again">Type it again</label>
        <input id="pq-again" className="input pq-input" type={show ? 'text' : 'password'} autoComplete="new-password" aria-label="Password again" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={enter(onEnter)} />
      </div>
    </>
  );
  const codeField = (onEnter: () => void) => (
    <div className="pq-field">
      <label className="pq-label" htmlFor="pq-code">6-digit code</label>
      <input id="pq-code" className="input pq-input pq-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="••••••" value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} onKeyDown={enter(onEnter)} />
      <span className="small muted">From PaddleQ &lt;hello@paddleq.in&gt;. Works for one hour.</span>
    </div>
  );
  const message = msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>;
  const primary = (label: string, busyLabel: string, fn: () => void) => (
    <button type="button" className="btn btn-primary pq-big" disabled={busy || !b} onClick={fn}>{busy ? busyLabel : <>{label}<Arrow /></>}</button>
  );
  const textLink = (label: string, fn: () => void) => <button type="button" className="pq-text-link" onClick={fn}>{label}</button>;
  const back = () => to('signin');
  const mailInfo = (
    <div className="pq-info">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
      <span>Not there in a minute? Check Spam or Promotions. Keep this screen open: copy the code from your email and come back.</span>
    </div>
  );

  return (
    <main className="screen pq-screen" aria-labelledby="signin-title">
      {step === 'signin' && (admin
        ? <FlowHeader title="PaddleQ admin" sub="For PaddleQ admins only." onBack={onBack} />
        : landing ? <LandingHero /> : <FlowHeader title="Sign in" sub="For clubs and organisers." onBack={onBack} />)}
      {step === 'signup' && <FlowHeader title="Create your account" sub="Run your club’s tournaments on PaddleQ." onBack={back} step={1} />}
      {step === 'confirm' && <FlowHeader title="Check your email" sub={<>We sent a 6-digit code to <b>{email.trim()}</b></>} onBack={back} step={2} />}
      {(step === 'forgot' || step === 'reset') && <FlowHeader title="Reset your password" sub={step === 'forgot' ? 'We’ll email you a 6-digit code.' : <>We sent a code to <b>{email.trim()}</b></>} onBack={back} />}
      {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}

      {step === 'signin' && (
        <>
          {landing && !admin && (
            <div>
              <h2 className="pq-h2">Sign in</h2>
              <p className="pq-sub">For clubs and organisers.</p>
            </div>
          )}
          {emailField}
          <div className="pq-field">
            <div className="pq-label-row">
              <label className="pq-label" htmlFor="pq-password">Password</label>
              {textLink('Forgot password?', () => to('forgot'))}
            </div>
            <div className="pq-pw">
              <input id="pq-password" className="input pq-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyDown={enter(signIn)} />
              <button type="button" className="pq-show" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {message}
          {primary('Sign in', 'Signing in…', signIn)}
          {!admin && (
            <>
              <div className="pq-or">New to PaddleQ?</div>
              <button type="button" className="btn btn-outline pq-big" onClick={() => to('signup')}>Create an account</button>
            </>
          )}
          {landing && !admin && <MoreWays go={go} />}
          {!admin && <p className="pq-note">Referee or on the desk? Open the link your organiser sent you. No account needed.</p>}
        </>
      )}
      {step === 'signup' && (
        <>
          {emailField}
          {newPasswordFields(signUp)}
          {message}
          {primary('Create account', 'Creating…', signUp)}
          <div className="pq-info">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>
            <span>We email you a 6-digit code to confirm it’s really you. Then add your club: PaddleQ checks every new club before it hosts tournaments, usually within a day.</span>
          </div>
          <p className="pq-note">Already have an account? {textLink('Sign in', back)}</p>
        </>
      )}
      {step === 'confirm' && (
        <>
          {message}
          {codeField(confirm)}
          {primary('Confirm and sign in', 'Checking…', confirm)}
          <div className="pq-row-split">
            {textLink('Send a new code', () => void run(async () => { await b?.resendConfirm?.(email); setMsg({ ok: true, text: 'New code sent. Use the latest email.' }); }))}
            {textLink('Use a different email', () => to('signup'))}
          </div>
          {mailInfo}
        </>
      )}
      {step === 'forgot' && (
        <>
          {emailField}
          {message}
          {primary('Email me a code', 'Sending…', forgot)}
          {textLink('Back to sign in', back)}
        </>
      )}
      {step === 'reset' && (
        <>
          {message}
          {codeField(reset)}
          {newPasswordFields(reset)}
          {primary('Save password and sign in', 'Saving…', reset)}
          <div className="pq-row-split">
            {textLink('Send a new code', () => void run(async () => { await b?.sendPasswordReset?.(email); setMsg({ ok: true, text: 'New code sent. Use the latest email.' }); }))}
            {textLink('Back to sign in', back)}
          </div>
          {mailInfo}
        </>
      )}
    </main>
  );
}

function Tick() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>;
}

/** Below the sign-in on paddleq.in: join a club by its invite link. */
function MoreWays({ go }: { go: Go }) {
  const [joining, setJoining] = useState(false);
  const [v, setV] = useState('');
  const code = (v.match(/club-join\/([^/?#\s]+)/)?.[1] ?? v.trim()).replace(/[^A-Za-z0-9-]/g, '');
  return (
    <div className="pq-links">
      <button type="button" className="pq-link-row" aria-expanded={joining} onClick={() => setJoining(!joining)}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
        <span><b>Got an invite from a club?</b> Join it</span>
        <span aria-hidden="true" className="pq-chev">{joining ? '⌄' : '›'}</span>
      </button>
      {joining && (
        <section className="pq-join" aria-label="Join a club">
          <input className="input pq-input" aria-label="Invite link or code" placeholder="Paste the invite link" value={v} onChange={(e) => setV(e.target.value)} />
          <button type="button" className="btn btn-outline" disabled={code.length < 4} onClick={() => go('club-join', code)}>Join</button>
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

export function ClubNew({ go, onBack }: { go: Go; onBack: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [me, setMe] = useState('');
  const [country, setCountry] = useState('+91');
  const [digits, setDigits] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    const b = backend();
    if (!b) return go('club');
    if (name.trim().length < 2) return setMsg('Give the club a name');
    if (!me.trim()) return setMsg('Add your name, as players will see it');
    const bad = phoneProblem(country, digits);
    if (bad) return setMsg(bad);
    setBusy(true);
    try {
      const id = await b.createClub(name, city, me);
      // The club exists now; if the request fails, the club page lets them send it again.
      await b.requestHosting(id, joinPhone(country, digits), note).catch(() => undefined);
      go('club-view', id, { replace: true });
    } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="newclub-title">
      <Header id="newclub-title" title="Create a club" onBack={onBack} />
      <Field label="Club name"><input className="input" aria-label="Club name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="City (optional)"><input className="input" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} /></Field>
      <Field label="Your name"><input className="input" aria-label="Your name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={60} /></Field>
      <PhoneField country={country} digits={digits} onChange={(c, d) => { setCountry(c); setDigits(d); }} />
      <Field label="About your club (optional)"><textarea className="input" aria-label="About your club" rows={3} placeholder="Where you play, how many courts, tournaments you plan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
      <p className="small muted" style={{ margin: 0 }}>You’ll be the owner. PaddleQ checks every new club before it can host tournaments; we’ll call or WhatsApp you on this number, usually within a day.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>Create club and ask to host</button>
    </main>
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
        <p style={{ margin: 0 }}>You’ve been invited to join a club in PaddleQ.</p>
        <p className="small muted" style={{ margin: 0 }}>Joining shares your name and the club matches you play with that club. Your personal PaddleQ stays private unless you choose to share parts of it.</p>
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
