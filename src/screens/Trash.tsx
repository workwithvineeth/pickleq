import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { daysLeftInTrash, restoreFromTrash, trashedMatches } from '../db/matches';
import { restoreSession, trashedSessions } from '../db/training';
import { sessionLabel } from './Train';
import { restoreTournament, trashedTournaments } from '../db/tournaments';
import { dateRange } from './Tournaments';
import { shortDate } from '../components/MatchRow';

export function Trash({ onBack }: { onBack: () => void }) {
  const items = useLiveQuery(() => trashedMatches(), []);
  const sessions = useLiveQuery(() => trashedSessions(), []);
  const tournaments = useLiveQuery(() => trashedTournaments(), []);
  const DAY = 86_400_000;
  return (
    <main className="screen" aria-labelledby="trash-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="trash-title" className="screen-title" style={{ flex: 1 }}>Trash</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Deleted matches, training sessions and tournaments stay here for 30 days and don’t count in your stats. After that they are removed for good.</p>
      {items && sessions && tournaments && items.length === 0 && sessions.length === 0 && tournaments.length === 0 && <EmptyState icon="matches" title="Trash is empty">Nothing has been deleted.</EmptyState>}
      {items?.map((m) => (
        <div key={m.id} className="section">
          <MatchRow match={m} />
          <div className="header">
            <span className="small muted">{daysLeftInTrash(m)} days left</span>
            <button type="button" className="link-btn" onClick={() => restoreFromTrash(m.id)}>Restore</button>
          </div>
        </div>
      ))}
      {sessions?.map((t) => (
        <div key={t.id} className="section">
          <div className="match-row"><span style={{ flex: 1 }}><span style={{ fontWeight: 500 }}>{sessionLabel(t.type)}</span> <span className="small muted">· {shortDate(t.date)}{t.minutes ? ` · ${t.minutes} min` : ''}</span></span></div>
          <div className="header">
            <span className="small muted">{Math.max(0, 30 - Math.floor((Date.now() - (t.deletedAt ?? 0)) / DAY))} days left</span>
            <button type="button" className="link-btn" onClick={() => restoreSession(t.id)}>Restore</button>
          </div>
        </div>
      ))}
      {tournaments?.map((t) => (
        <div key={t.id} className="section">
          <div className="match-row"><span style={{ flex: 1 }}><span style={{ fontWeight: 500 }}>{t.name}</span> <span className="small muted">· tournament · {dateRange(t)}</span></span></div>
          <div className="header">
            <span className="small muted">{Math.max(0, 30 - Math.floor((Date.now() - (t.deletedAt ?? 0)) / DAY))} days left</span>
            <button type="button" className="link-btn" onClick={() => restoreTournament(t.id)}>Restore</button>
          </div>
        </div>
      ))}
    </main>
  );
}
