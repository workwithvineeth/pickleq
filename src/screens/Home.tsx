import { useLiveQuery } from 'dexie-react-hooks';
import { backupDue, daysSince, lastBackupAt } from '../backup/status';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { channel } from '../config';
import { activeMatches } from '../db/matches';
import { recordSummary, winPct, type WinLoss } from '../domain/record';
import type { Go } from '../navigation';

function today(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function Split({ label, r }: { label: string; r: WinLoss }) {
  const pct = winPct(r);
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '6px 10px' }}>
      <div className="small muted">{label}</div>
      <div style={{ fontWeight: 600 }}>
        {r.wins}–{r.losses} {pct !== null && <span className="small muted" style={{ fontWeight: 400 }}>{pct}%</span>}
      </div>
    </div>
  );
}

export function Home({ go }: { go: Go }) {
  const matches = useLiveQuery(() => activeMatches(), []);
  const summary = recordSummary(matches ?? []);
  const pct = winPct(summary.overall);
  const total = summary.overall.wins + summary.overall.losses;
  const last = lastBackupAt();
  const showBackup = backupDue(matches?.length ?? 0, last);
  const ago = daysSince(last);

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

      {summary.incomplete > 0 && (
        <button type="button" className="banner-btn" onClick={() => go('matches', 'incomplete')}>
          <span>{summary.incomplete} {summary.incomplete === 1 ? 'match needs' : 'matches need'} details</span><span>Finish ›</span>
        </button>
      )}

      {showBackup && (
        <button type="button" className="banner-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} onClick={() => go('backup')}>
          <span>{ago === null ? 'Matches not backed up yet' : `Last backup ${ago} days ago`}</span><span>Back up ›</span>
        </button>
      )}

      <section className="card" aria-label="Overall record">
        <div className="small muted">Overall record{total ? ` · ${total} ${total === 1 ? 'match' : 'matches'}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600 }}>{summary.overall.wins}–{summary.overall.losses}</span>
          {pct !== null && <span className="muted">{pct}% won</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
          <Split label="Singles" r={summary.singles} />
          <Split label="Doubles" r={summary.doubles} />
        </div>
      </section>

      {matches && matches.length === 0 && (
        <EmptyState icon="ball" title="Log your first match"
          action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Your ratings, form, training and insights fill in here as you play.
        </EmptyState>
      )}

      {matches && matches.length > 0 && (
        <section className="section" aria-label="Recent matches">
          <div className="header"><h2 style={{ fontSize: 18 }}>Recent matches</h2><button type="button" className="link-btn" onClick={() => go('matches')}>See all</button></div>
          {matches.slice(0, 3).map((m) => <MatchRow key={m.id} match={m} onOpen={() => go('match', m.id)} />)}
        </section>
      )}
    </main>
  );
}
