import { Icon } from '../components/Icon';
import { appVersion, channel } from '../config';

export function Settings({ onBack }: { onBack: () => void }) {
  const installed = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
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
    </main>
  );
}
