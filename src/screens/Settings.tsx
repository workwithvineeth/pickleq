import { useState } from 'react';
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
