import { useEffect, useState } from 'react';
import { Field } from '../../components/Controls';
import type { NewMatch } from '../../db/matches';
import type { Go } from '../../navigation';
import { clubServerConfig, isClubApp, setClubMode } from '../config';
import { backend, demoBackend, serverBackend, takeReturn } from '../index';
import { importClubMatches, pendingClubMatches } from '../personal';
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
    // PQ Club (the club-only app) has no personal history to add club matches to.
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
  return (
    <main className="screen" aria-labelledby="club-title">
      <Header id="club-title" title={isClubApp() ? 'My club' : 'Club'} onBack={isClubApp() ? undefined : onBack} />
      <Status error={state.error} loading={state.loading && !signedIn} />
      {!state.loading && !signedIn && (
        <>
          {isClubApp() ? (
            <section className="card section" aria-label="About PQ Club">
              <h2 style={{ fontSize: 18 }}>Run your club’s tournaments</h2>
              <p className="small" style={{ margin: 0 }}>Entries (or import them from a Google Form), the draw, a scorer on every court with a PIN link, and live results anyone can open.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Organisers sign in with email and a PIN. Helpers and court scorers use the event PIN the organiser gives them. Players don’t need an account.</li>
                <li>Joining a club? Open the invite link the club sent you, or paste it below.</li>
              </ul>
            </section>
          ) : (
            <section className="card section" aria-label="About Club mode">
              <h2 style={{ fontSize: 18 }}>Play with your club</h2>
              <p className="small" style={{ margin: 0 }}>Run club tournaments with live scoring, and give coaches a view of where each player wins and loses points.</p>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Your personal PICKLEQ stays on this phone. Nothing is shared unless you choose.</li>
                <li>Club matches you play can be added to your own history.</li>
                <li>Signing in is only needed for Club mode.</li>
              </ul>
            </section>
          )}
          {server && <button type="button" className="btn btn-primary" onClick={() => go('club-signin')}>Sign in</button>}
          {isClubApp() && <JoinByLink go={go} />}
          <section className="card section" aria-label="Demo club">
            <h2 style={{ fontSize: 18 }}>Try the demo club</h2>
            <p className="small muted" style={{ margin: 0 }}>PQ Demo Club: 56 made-up players and a tournament with 20 singles players and 24 doubles teams. It stays on this phone.</p>
            <label className="label" htmlFor="demo-name">Your name in the demo</label>
            <input id="demo-name" className="input" value={demoName} onChange={(e) => setDemoName(e.target.value)} placeholder="You" maxLength={40} />
            <button type="button" className="btn btn-outline" disabled={busy} onClick={startDemo}>Open PQ Demo Club</button>
          </section>
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
          {b?.kind === 'server' && <MyPinCard />}
          {b?.kind === 'server' && <button type="button" className="btn btn-outline" onClick={() => go('club-new')}>Create a club</button>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={signOut}>
            {b?.kind === 'demo' ? 'Close the demo and delete it from this phone' : isClubApp() ? 'Sign out' : 'Sign out of Club mode'}
          </button>
        </>
      )}
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

export function ClubSignIn({ go, onBack }: { go: Go; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [useLink, setUseLink] = useState(false);
  const b = serverBackend();

  function signedIn() {
    setClubMode('server');
    const back = takeReturn();
    if (back) { window.location.replace(back); return; }
    const pending = readPendingJoin();
    if (pending) { writePendingJoin(null); go('club-join', pending, { replace: true }); } else go('club', undefined, { replace: true });
  }

  // Opened from the email's sign-in link: finish signing in.
  useEffect(() => {
    if (!b?.finishLinkSignIn) return;
    let alive = true;
    setBusy(true);
    b.finishLinkSignIn().then(
      (done) => { if (alive) { setBusy(false); if (done) signedIn(); } },
      (e: unknown) => { if (alive) { setBusy(false); setMsg(errorText(e)); } },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  async function withPin() {
    if (!emailOk) return setMsg('Enter your email address');
    if (!/^\d{4,6}$/.test(pin)) return setMsg('Enter your PIN (4 to 6 digits)');
    setBusy(true); setMsg(null);
    try { await b?.pinSignIn?.({ mode: 'account', email: email.trim(), pin }); signedIn(); }
    catch (e) { setMsg(errorText(e)); setPin(''); } finally { setBusy(false); }
  }
  async function send() {
    if (!emailOk) return setMsg('Enter your email address');
    setBusy(true); setMsg(null);
    try { await b?.sendCode(email); setSent(true); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <main className="screen" aria-labelledby="signin-title">
      <Header id="signin-title" title="Sign in" onBack={onBack} />
      {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Organisers sign in with their email and their own PIN. Helping at a tournament? Open the helper link the organiser sent you instead; it asks for the event PIN.
      </p>
      <Field label="Email">
        <input className="input" type="email" inputMode="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
      </Field>
      {!useLink && (
        <>
          <Field label="Your PIN">
            <input className="input" type="password" inputMode="numeric" autoComplete="current-password" aria-label="Your PIN" maxLength={6} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void withPin(); }} />
          </Field>
          {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
          <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={withPin}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setUseLink(true); setMsg(null); }}>
            No PIN yet? Get an email sign-in link
          </button>
        </>
      )}
      {useLink && (
        <>
          <p className="small muted" style={{ margin: 0 }}>We email you a sign-in link. Open it in this same browser (a laptop is easiest). Once you’re in, set your PIN in My club, so next time you just type it.</p>
          {sent && <div role="status" className="msg msg-ok">Email sent. Open it in this browser and tap the link. Check spam if it isn’t there in a minute.</div>}
          {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
          {busy && !sent && !email && <p className="small muted" role="status">Signing you in…</p>}
          {!sent
            ? <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={send}>Email me a sign-in link</button>
            : <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSent(false)}>Use a different email, or send again</button>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setUseLink(false); setSent(false); setMsg(null); }}>Sign in with a PIN instead</button>
        </>
      )}
    </main>
  );
}

/** Desk helpers: the organiser shares this tournament's helper link and the event PIN (the same PIN as the court scorers). */
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
  return (
    <main className="screen" aria-labelledby="helper-title">
      <Header id="helper-title" title="Help run the tournament" />
      {info.data?.logoUrl && <img src={info.data.logoUrl} alt={`${info.data.club} logo`} className="club-logo" />}
      {info.data && <p className="small" style={{ margin: 0 }}><b>{info.data.club}</b></p>}
      <p className="small muted" style={{ margin: 0 }}>Type your name and the event PIN the organiser gave you (the same PIN the court scorers use). You’ll get the desk, entries and scores for this tournament.</p>
      {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}
      <Field label="Your name">
        <input className="input" aria-label="Your name" autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Event PIN">
        <input className="input" type="password" inputMode="numeric" aria-label="Event PIN" maxLength={6} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} />
      </Field>
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in as a helper'}</button>
    </main>
  );
}

/** Signed in on the club server: set or change your own sign-in PIN. */
function MyPinCard() {
  const b = serverBackend();
  const has = useLoad(async () => (b?.hasMyPin ? b.hasMyPin() : false), [b]);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!/^\d{4,6}$/.test(pin)) return setMsg({ ok: false, text: 'A PIN is 4 to 6 digits' });
    if (pin !== again) return setMsg({ ok: false, text: 'The two PINs don’t match' });
    setBusy(true); setMsg(null);
    try { await b?.setMyPin?.(pin); setMsg({ ok: true, text: 'PIN saved. Next time, sign in with your email and this PIN.' }); setOpen(false); setPin(''); setAgain(''); has.reload(); }
    catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="card section" aria-label="Your sign-in PIN">
      <div className="row"><h2 style={{ fontSize: 18 }}>Your sign-in PIN</h2>{has.data && <span className="pill pill-ok">Set</span>}</div>
      <p className="small muted" style={{ margin: 0 }}>{has.data ? 'You sign in with your email and this PIN. Keep it to yourself.' : 'Set a 4 to 6 digit PIN so you can sign in without an email next time.'}</p>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {!open && <button type="button" className="btn btn-outline" onClick={() => { setOpen(true); setMsg(null); }}>{has.data ? 'Change my PIN' : 'Set my PIN'}</button>}
      {open && (
        <>
          <Field label="New PIN">
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" aria-label="New PIN" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Type it again">
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" aria-label="New PIN again" maxLength={6} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Save PIN</button>
            <button type="button" className="btn btn-outline" onClick={() => { setOpen(false); setPin(''); setAgain(''); }}>Cancel</button>
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
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    const b = backend();
    if (!b) return go('club');
    if (name.trim().length < 2) return setMsg('Give the club a name');
    if (!me.trim()) return setMsg('Add your name, as players will see it');
    setBusy(true);
    try { go('club-view', await b.createClub(name, city, me), { replace: true }); } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="newclub-title">
      <Header id="newclub-title" title="Create a club" onBack={onBack} />
      <Field label="Club name"><input className="input" aria-label="Club name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label="City (optional)"><input className="input" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} /></Field>
      <Field label="Your name"><input className="input" aria-label="Your name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={60} /></Field>
      <p className="small muted" style={{ margin: 0 }}>You’ll be the owner. You can invite players and coaches with a link.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>Create club</button>
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
        <p style={{ margin: 0 }}>You’ve been invited to join a club in PICKLEQ.</p>
        <p className="small muted" style={{ margin: 0 }}>Joining shares your name and the club matches you play with that club. Your personal PICKLEQ stays private unless you choose to share parts of it.</p>
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
