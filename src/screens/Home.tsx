import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { channel } from '../config';
import type { Route } from '../navigation';

function today(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function Home({ go }: { go: (r: Route) => void }) {
  return (
    <main className="screen" aria-labelledby="home-title">
      <header className="header">
        <div>
          <h1 id="home-title" className="brand">PICKLEQ</h1>
          <div className="small muted">{today()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {channel === 'preview' && <span className="badge badge-preview">Preview</span>}
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => go('settings')}>
            <Icon name="settings" size={20} />
          </button>
        </div>
      </header>

      <section className="card" aria-label="Overall record">
        <div className="small muted">Overall record</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600 }}>0–0</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '6px 10px' }}>
            <div className="small muted">Singles</div>
            <div style={{ fontWeight: 600 }}>0–0</div>
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '6px 10px' }}>
            <div className="small muted">Doubles</div>
            <div style={{ fontWeight: 600 }}>0–0</div>
          </div>
        </div>
      </section>

      <EmptyState
        icon="ball"
        title="Log your first match"
        action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}
      >
        Your ratings, form, training and insights fill in here as you play.
      </EmptyState>
    </main>
  );
}
