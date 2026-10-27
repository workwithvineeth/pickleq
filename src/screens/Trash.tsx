import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { daysLeftInTrash, restoreFromTrash, trashedMatches } from '../db/matches';

export function Trash({ onBack }: { onBack: () => void }) {
  const items = useLiveQuery(() => trashedMatches(), []);
  return (
    <main className="screen" aria-labelledby="trash-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="trash-title" className="screen-title" style={{ flex: 1 }}>Trash</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Deleted matches stay here for 30 days and don’t count in your stats. After that they are removed for good.</p>
      {items && items.length === 0 && <EmptyState icon="matches" title="Trash is empty">Nothing has been deleted.</EmptyState>}
      {items?.map((m) => (
        <div key={m.id} className="section">
          <MatchRow match={m} />
          <div className="header">
            <span className="small muted">{daysLeftInTrash(m)} days left</span>
            <button type="button" className="link-btn" onClick={() => restoreFromTrash(m.id)}>Restore</button>
          </div>
        </div>
      ))}
    </main>
  );
}
