import { useEffect, useState } from 'react';
import { Field } from '../../components/Controls';
import type { NewMatch } from '../../db/matches';
import type { Go } from '../../navigation';
import { clubServerConfig, setClubMode } from '../config';
import { backend, demoBackend, serverBackend } from '../index';
import { importClubMatches, pendingClubMatches } from '../personal';
import { DemoNote, errorText, Header, RoleBadge, Status, useLoad } from './common';

const PENDING_JOIN = 'pq-club-pending-join';

export function ClubHub({ go, onBack }: { go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) return null;
    const user = await b.currentUser();
    if (!user) return null;
    const [clubs, pending] = await Promise.all([b.myClubs(), pendingClubMatches(b).catch(() => [] as NewMatch[])]);
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
      <Header id="club-title" title="Club" onBack={onBack} />
      <Status error={state.error} loading={state.loading && !signedIn} />
      {!state.loading && !signedIn && (
        <>
          <section className="card section" aria-label="About Club mode">
            <h2 style={{ fontSize: 18 }}>Play with your club</h2>
            <p className="small" style={{ margin: 0 }}>Run club tournaments with live scoring, and give coaches a view of where each player wins and loses points.</p>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Your personal PICKLEQ stays on this phone. Nothing is shared unless you choose.</li>
              <li>Club matches you play can be added to your own history.</li>
              <li>Signing in is only needed for Club mode.</li>
            </ul>
          </section>
          {server && <button type="button" className="btn btn-primary" onClick={() => go('club-signin')}>Sign in with email</button>}
          <section className="card section" aria-label="Demo club">
            <h2 style={{ fontSize: 18 }}>Try the demo club</h2>
            <p className="small muted" style={{ margin: 0 }}>Pickleball Central: 56 made-up players and a tournament with 20 singles players and 24 doubles teams. It stays on this phone.</p>
            <label className="label" htmlFor="demo-name">Your name in the demo</label>
            <input id="demo-name" className="input" value={demoName} onChange={(e) => setDemoName(e.target.value)} placeholder="You" maxLength={40} />
            <button type="button" className="btn btn-outline" disabled={busy} onClick={startDemo}>Open Pickleball Central</button>
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
          {b?.kind === 'server' && <button type="button" className="btn btn-outline" onClick={() => go('club-new')}>Create a club</button>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={signOut}>
            {b?.kind === 'demo' ? 'Close the demo and delete it from this phone' : 'Sign out of Club mode'}
          </button>
        </>
      )}
    </main>
  );
}

export function ClubSignIn({ go, onBack }: { go: Go; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const b = serverBackend();

  function signedIn() {
    setClubMode('server');
    const pending = sessionStorage.getItem(PENDING_JOIN);
    if (pending) { sessionStorage.removeItem(PENDING_JOIN); go('club-join', pending, { replace: true }); } else go('club', undefined, { replace: true });
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

  async function send() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg('Enter your email address');
    setBusy(true); setMsg(null);
    try { await b?.sendCode(email); setSent(true); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) return setMsg('Enter the 6-digit code from the email');
    setBusy(true); setMsg(null);
    try { await b?.verifyCode(email, code); signedIn(); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <main className="screen" aria-labelledby="signin-title">
      <Header id="signin-title" title="Sign in" onBack={onBack} />
      {!b && <div role="alert" className="msg msg-bad">The club server isn’t set up in this version.</div>}
      <p className="small muted" style={{ margin: 0 }}>We email you a sign-in link. There’s no password to remember.</p>
      <Field label="Email">
        <input className="input" type="email" inputMode="email" autoComplete="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
      </Field>
      {sent && (
        <>
          <div role="status" className="msg msg-ok">Email sent. Open it on this phone and tap <b>Sign in</b>. Use the same browser you’re in now. Check spam if it isn’t there in a minute.</div>
          <Field label="Or enter the 6-digit code, if your email has one">
            <input className="input" inputMode="numeric" autoComplete="one-time-code" aria-label="Code from the email" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </>
      )}
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      {busy && !sent && !email && <p className="small muted" role="status">Signing you in…</p>}
      {!sent
        ? <button type="button" className="btn btn-primary" disabled={busy || !b} onClick={send}>Email me a sign-in link</button>
        : <>
            {code.length === 6 && <button type="button" className="btn btn-primary" disabled={busy} onClick={verify}>Sign in with the code</button>}
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setSent(false); setCode(''); }}>Use a different email, or send again</button>
          </>}
    </main>
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
    sessionStorage.setItem(PENDING_JOIN, code);
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
