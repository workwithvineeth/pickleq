import { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { db } from '../db/db';
import { ownKeys, tryPin, failState } from './pin';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
const fmtWait = (ms: number) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} min` : `${Math.ceil(ms / 1000)} s`);

/** Erases everything this version of the app keeps on the phone. Used only when the PIN is forgotten. */
export async function eraseAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => { for (const t of db.tables) await t.clear(); });
  for (const k of ownKeys()) { try { localStorage.removeItem(k); } catch { /* blocked */ } }
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(() => failState().until);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [typed, setTyped] = useState('');
  const waiting = waitUntil > now;

  useEffect(() => { if (!waiting) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [waiting]);

  async function submit(p: string) {
    setBusy(true);
    const r = await tryPin(p);
    setBusy(false);
    if (r.ok) { onUnlock(); return; }
    setPin('');
    if (r.waitMs) { setWaitUntil(Date.now() + r.waitMs); setNow(Date.now()); setMsg(`Too many wrong PINs. Try again in ${fmtWait(r.waitMs)}.`); }
    else setMsg(`Wrong PIN. ${5 - r.fails} ${5 - r.fails === 1 ? 'try' : 'tries'} before a short wait.`);
  }
  function press(k: string) {
    if (busy || waiting) return;
    setMsg(null);
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (!k || pin.length >= 6) return;
    setPin(pin + k);
  }

  if (forgot) {
    return (
      <main className="screen lock" aria-labelledby="forgot-title">
        <h1 id="forgot-title" className="screen-title">Forgot your PIN?</h1>
        <p>The PIN can’t be recovered or reset. The only way back in is to <b>erase everything PICKLEQ keeps on this phone</b>, then restore your latest backup file from Settings → Backup.</p>
        <p className="small muted">Anything since your last backup will be lost. Your Claude key is erased too.</p>
        <label className="label" htmlFor="erase-confirm">Type ERASE to confirm</label>
        <input id="erase-confirm" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" className="btn btn-primary" disabled={typed !== 'ERASE'} onClick={async () => { await eraseAll(); onUnlock(); }}>Erase and start again</button>
        <button type="button" className="btn btn-outline" onClick={() => { setForgot(false); setTyped(''); }}>Go back</button>
      </main>
    );
  }

  return (
    <main className="screen lock" aria-labelledby="lock-title">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 24 }}>
        <Logo size={56} />
        <h1 id="lock-title" className="screen-title">Enter your PIN</h1>
        <div className="pin-dots" aria-label={`${pin.length} digits entered`}>{Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
        <div role="status" className="msg msg-bad" style={{ minHeight: 20, textAlign: 'center' }}>{waiting ? `Try again in ${fmtWait(waitUntil - now)}.` : msg}</div>
      </div>
      <div className="pin-pad" role="group" aria-label="PIN keypad">
        {KEYS.map((k, i) => k ? (
          <button key={i} type="button" className="pin-key" disabled={busy || waiting} aria-label={k === 'del' ? 'Delete' : k} onClick={() => press(k)}>{k === 'del' ? '⌫' : k}</button>
        ) : <span key={i} />)}
      </div>
      <button type="button" className="btn btn-primary" disabled={pin.length < 4 || busy || waiting} onClick={() => submit(pin)}>{busy ? 'Checking…' : 'Unlock'}</button>
      <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setForgot(true)}>Forgot PIN?</button>
    </main>
  );
}
