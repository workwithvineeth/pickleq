import { useEffect, useState } from 'react';
import { Field } from '../../components/Controls';
import type { NewMatch } from '../../db/matches';
import type { Go } from '../../navigation';
import { clubServerConfig, isClubApp, setClubMode } from '../config';
import { backend, demoBackend, serverBackend, takeReturn } from '../index';
import { importClubMatches, pendingClubMatches } from '../personal';
import { emailOk, MIN_PASSWORD, passwordProblem } from '../authText';
import { ClubLogo } from './Poster';
import { DemoNote, errorText, Header, RoleBadge, Status, useLoad } from './common';

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
    return { user, clubs, pending };
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
      <Header id="club-title" title={isClubApp() ? 'My club' : 'Club'} onBack={isClubApp() ? undefined : onBack} />
      <Status error={state.error} loading={state.loading && !signedIn} />
      {!state.loading && !signedIn && (
        <>
          {isClubApp() ? (
            <section className="card section" aria-label="About PaddleQ">
              <h2 style={{ fontSize: 18 }}>Run your club’s tournaments</h2>
              <p className="small" style={{ margin: 0 }}>Entries (or import them from a Google Form), the draw, a scorer on every court with a PIN link, and live results anyone can open.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Organisers sign in with email and password. Referees and the desk team use the event PIN the organiser gives them. Players don’t need an account.</li>
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
      {signedIn && (
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

  const title = admin ? 'PaddleQ admin' : landing && step === 'signin' ? 'Welcome to PaddleQ' : step === 'signup' ? 'Create your account' : step === 'confirm' ? 'Confirm your email' : step === 'forgot' || step === 'reset' ? 'Reset your password' : 'Sign in';
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') fn(); };
  const emailField = (
    <Field label="Email">
      <input className="input" type="email" inputMode="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === 'confirm' || step === 'reset'} />
    </Field>
  );
  const newPasswordFields = (onEnter: () => void) => (
    <>
      <Field label={`${step === 'reset' ? 'New password' : 'Password'} (${MIN_PASSWORD}+ characters, letters and numbers)`}>
        <input className="input" type="password" autoComplete="new-password" aria-label={step === 'reset' ? 'New password' : 'Choose a password'} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Type it again">
        <input className="input" type="password" autoComplete="new-password" aria-label="Password again" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={enter(onEnter)} />
      </Field>
    </>
  );
  const codeField = (onEnter: () => void) => (
    <Field label="6-digit code">
      <input className="input" inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit code" maxLength={7} value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} onKeyDown={enter(onEnter)} />
    </Field>
  );
  const message = msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>;
  const link = (label: string, fn: () => void) => <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={fn}>{label}</button>;

  return (
    <main className="screen" aria-labelledby="signin-title">
      <Header id="signin-title" title={title} onBack={landing && step === 'signin' ? undefined : landing ? () => to('signin') : onBack} />
      {landing && step === 'signin' && <img src="icons/club-192.png" alt="PaddleQ logo" width={88} height={88} className="club-logo" style={{ width: 88, height: 88, border: 'none', background: 'none' }} />}
      {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}
      {step === 'signin' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {admin ? 'For PaddleQ admins only.' : 'For clubs and organisers. Refereeing or on the desk at a tournament? Open the link the organiser sent you instead; it asks for the event PIN.'}
          </p>
          {emailField}
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={enter(signIn)} />
          </Field>
          {message}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {link('Forgot password?', () => to('forgot'))}
          {!admin && link('New to PaddleQ? Create an account', () => to('signup'))}
          {landing && <JoinByLink go={go} />}
        </>
      )}
      {step === 'signup' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>We’ll email you a 6-digit code to confirm it’s your email. After that, ask to host tournaments from My club; PaddleQ approves new clubs.</p>
          {emailField}
          {newPasswordFields(signUp)}
          {message}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={signUp}>{busy ? 'Creating…' : 'Create account'}</button>
          {link('Already have an account? Sign in', () => to('signin'))}
        </>
      )}
      {step === 'confirm' && (
        <>
          {emailField}
          {message}
          {codeField(confirm)}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={confirm}>{busy ? 'Checking…' : 'Confirm and sign in'}</button>
          {link('Send a new code', () => void run(async () => { await b?.resendConfirm?.(email); setMsg({ ok: true, text: 'New code sent. Use the latest email.' }); }))}
          {link('Back to sign in', () => to('signin'))}
        </>
      )}
      {step === 'forgot' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>We’ll email you a 6-digit code. Then you choose a new password.</p>
          {emailField}
          {message}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={forgot}>{busy ? 'Sending…' : 'Email me a code'}</button>
          {link('Back to sign in', () => to('signin'))}
        </>
      )}
      {step === 'reset' && (
        <>
          {emailField}
          {message}
          {codeField(reset)}
          {newPasswordFields(reset)}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={reset}>{busy ? 'Saving…' : 'Save password and sign in'}</button>
          {link('Send a new code', () => void run(async () => { await b?.sendPasswordReset?.(email); setMsg({ ok: true, text: 'New code sent. Use the latest email.' }); }))}
          {link('Back to sign in', () => to('signin'))}
        </>
      )}
    </main>
  );
}

/** The tournament's desk team: the organiser shares the desk link (#/helper/<slug>) and the event PIN (the same PIN
 * the referees use). The page carries the club's name and logo: "<Club> Desk". */
export function HelperSignIn({ slug, go }: { slug: string; go: Go }) {
  const b = serverBackend();
  const info = useLoad(async () => (b ? b.publicClubLogo(slug).catch(() => null) : null), [b, slug]);
  const [name, setName] = useState(() => { try { return localStorage.getItem('pq-helper-name') ?? ''; } catch { return ''; } });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function signIn() {
    if (name.trim().length < 2) return setMsg('Add your name, so the organiser knows who you are');
    if (!/^\d{4,6}$/.test(pin)) return setMsg('Enter the event PIN');
    setBusy(true); setMsg(null);
    try {
      try { localStorage.setItem('pq-helper-name', name.trim()); } catch { /* private mode */ }
      const r = await b?.pinSignIn?.({ mode: 'helper', slug, name: name.trim(), pin });
      setClubMode('server');
      if (r?.tournamentId) go('club-tournament', r.tournamentId, { replace: true }); else go('club', undefined, { replace: true });
    } catch (e) { setMsg(errorText(e)); setPin(''); } finally { setBusy(false); }
  }
  const club = info.data?.club;
  return (
    <main className="screen" aria-labelledby="helper-title">
      <Header id="helper-title" title={club ? `${club} Desk` : 'Tournament desk'} />
      <section className="card section" aria-label="Desk sign-in">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          <ClubLogo src={info.data?.logoUrl} club={club ?? 'Club'} size={48} />
          <div className="small muted">{club ? `Run by ${club} on PaddleQ` : 'On PaddleQ'}</div>
        </div>
        <p className="small" style={{ margin: 0 }}>For the desk team: type your name and the event PIN the organiser gave you (the same PIN the referees use). You’ll get the desk, entries and scores for this tournament.</p>
        {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}
        <Field label="Your name">
          <input className="input" aria-label="Your name" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Event PIN">
          <input className="input" type="password" inputMode="numeric" aria-label="Event PIN" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} />
        </Field>
        {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
        <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in to the desk'}</button>
      </section>
    </main>
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
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    const b = backend();
    if (!b) return go('club');
    if (name.trim().length < 2) return setMsg('Give the club a name');
    if (!me.trim()) return setMsg('Add your name, as players will see it');
    if (phone.replace(/\D/g, '').length < 10) return setMsg('Add a phone number PaddleQ can call (10 digits)');
    setBusy(true);
    try {
      const id = await b.createClub(name, city, me);
      // The club exists now; if the request fails, the club page lets them send it again.
      await b.requestHosting(id, phone, note).catch(() => undefined);
      go('club-view', id, { replace: true });
    } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="newclub-title">
      <Header id="newclub-title" title="Create a club" onBack={onBack} />
      <Field label="Club name"><input className="input" aria-label="Club name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="City (optional)"><input className="input" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} /></Field>
      <Field label="Your name"><input className="input" aria-label="Your name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={60} /></Field>
      <Field label="Phone number"><input className="input" type="tel" inputMode="tel" autoComplete="tel" aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} /></Field>
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
