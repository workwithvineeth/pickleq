import { useState } from 'react';
import { Chips, Field } from '../components/Controls';
import { checkNewPin, LOCK_AFTER, lockAfter, pinEnabled, removePin, setLockAfter, setPin, tryPin, type LockAfter } from '../lock/pin';
import { Icon } from '../components/Icon';
import { appVersion, channel } from '../config';
import { clearAllData, loadSampleData } from '../db/sample';
import { isInstalled } from '../install';
import type { Go } from '../navigation';

export function Settings({ onBack, go }: { onBack: () => void; go: Go }) {
  const installed = isInstalled();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <main className="screen" aria-labelledby="settings-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
        <h1 id="settings-title" className="screen-title" style={{ flex: 1 }}>Settings</h1>
      </header>
      <section className="card" aria-label="About this app">
        <div className="row"><span>Version</span><span className="muted">{appVersion}</span></div>
        <div className="row"><span>Version type</span><span className="muted">{channel === 'preview' ? 'Preview (sample data)' : 'Live (your data)'}</span></div>
        <div className="row"><span>Installed on home screen</span><span className="muted">{installed ? 'Yes' : 'No'}</span></div>
        <div className="row"><span>Where your data lives</span><span className="muted">This phone only</span></div>
      </section>
      <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('backup')}>
        <span>Backup, restore and export</span><span>›</span>
      </button>
      <AppLock />
      <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('help')}>
        <span>How to use PICKLEQ</span><span>›</span>
      </button>
      <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('privacy')}>
        <span>Privacy and your data</span><span>›</span>
      </button>
      {channel === 'preview' && (
        <section className="card section" aria-label="Preview test data">
          <h2 style={{ fontSize: 18 }}>Preview test data</h2>
          <p className="small muted" style={{ margin: 0 }}>Only in the Preview version. Your Live data is never touched.</p>
          <button type="button" className="btn btn-outline" onClick={async () => { const n = await loadSampleData(); setMsg(`Added ${n} sample matches.`); }}>Add sample matches</button>
          {confirmClear ? (
            <div className="sticky-actions" style={{ position: 'static' }}>
              <button type="button" className="btn btn-outline" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={async () => { await clearAllData(); setConfirmClear(false); setMsg('Preview data cleared.'); }}>Clear it all</button>
            </div>
          ) : (
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmClear(true)}>Clear all Preview data</button>
          )}
          {msg && <div role="status" className="msg msg-ok">{msg}</div>}
        </section>
      )}
    </main>
  );
}

function AppLock() {
  const [on, setOn] = useState(pinEnabled());
  const [mode, setMode] = useState<'idle' | 'set' | 'off'>('idle');
  const [pin, setPinText] = useState('');
  const [confirm, setConfirm] = useState('');
  const [current, setCurrent] = useState('');
  const [after, setAfter] = useState<LockAfter>(lockAfter());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setPinText(''); setConfirm(''); setCurrent(''); setMode('idle'); };
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  async function save() {
    if (on) {
      const r = await tryPin(current);
      if (!r.ok) return setMsg({ ok: false, text: r.waitMs ? 'Too many wrong PINs. Wait, then try again' : 'Your current PIN is wrong' });
    }
    const e = checkNewPin(pin, confirm);
    if (e) return setMsg({ ok: false, text: e });
    setBusy(true); await setPin(pin); setBusy(false);
    setOn(true); reset(); setMsg({ ok: true, text: on ? 'PIN changed' : 'App lock is on' });
  }
  async function turnOff() {
    const r = await tryPin(current);
    if (!r.ok) return setMsg({ ok: false, text: r.waitMs ? 'Too many wrong PINs. Wait, then try again' : 'That PIN is wrong' });
    removePin(); setOn(false); reset(); setMsg({ ok: true, text: 'App lock is off' });
  }
  const pinInput = (label: string, v: string, set: (s: string) => void) => (
    <Field label={label}><input className="input" type="password" inputMode="numeric" autoComplete="off" aria-label={label} value={v} onChange={(e) => { set(digits(e.target.value)); setMsg(null); }} /></Field>
  );

  return (
    <section className="card section" aria-label="App lock">
      <div className="header"><h2 style={{ fontSize: 18 }}>App lock</h2><span className={`pill ${on ? 'pill-ok' : ''}`}>{on ? 'On' : 'Off'}</span></div>
      <p className="small muted" style={{ margin: 0 }}>A 4–6 digit PIN to open PICKLEQ. It keeps people who pick up your phone out of the app. It doesn’t encrypt your data, and if you forget it the only way back in is to erase the app’s data and restore a backup.</p>
      {mode === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={() => { setMode('set'); setMsg(null); }}>{on ? 'Change PIN' : 'Turn on app lock'}</button>
          {on && <button type="button" className="btn btn-outline" onClick={() => { setMode('off'); setMsg(null); }}>Turn off</button>}
        </div>
      )}
      {mode === 'set' && (
        <>
          {on && pinInput('Current PIN', current, setCurrent)}
          {pinInput('New PIN', pin, setPinText)}
          {pinInput('New PIN again', confirm, setConfirm)}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>Save PIN</button>
            <button type="button" className="btn btn-outline" onClick={() => { reset(); setMsg(null); }}>Cancel</button>
          </div>
        </>
      )}
      {mode === 'off' && (
        <>
          {pinInput('Current PIN', current, setCurrent)}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={turnOff}>Turn off app lock</button>
            <button type="button" className="btn btn-outline" onClick={() => { reset(); setMsg(null); }}>Cancel</button>
          </div>
        </>
      )}
      {on && mode === 'idle' && (
        <Field label="Lock again when you leave the app">
          <Chips small label="Lock after" value={after} options={LOCK_AFTER} onChange={(v) => { setAfter(v); setLockAfter(v); }} />
        </Field>
      )}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    </section>
  );
}
