import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Chips } from '../components/Controls';
import { EmptyState } from '../components/EmptyState';
import { MatchRow } from '../components/MatchRow';
import { activeMatches } from '../db/matches';
import type { Match } from '../domain/types';
import type { Go } from '../navigation';

type Filter = 'all' | 'singles' | 'doubles' | 'tournament' | 'incomplete';
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' },
  { value: 'tournament', label: 'Tournament' }, { value: 'incomplete', label: 'Needs details' },
];

export function applyFilter(matches: Match[], f: Filter): Match[] {
  switch (f) {
    case 'singles': return matches.filter((m) => m.type === 'singles');
    case 'doubles': return matches.filter((m) => m.type !== 'singles');
    case 'tournament': return matches.filter((m) => m.category === 'tournament');
    case 'incomplete': return matches.filter((m) => m.status === 'incomplete');
    default: return matches;
  }
}

export function Matches({ go, initialFilter = 'all' }: { go: Go; initialFilter?: Filter }) {
  const matches = useLiveQuery(() => activeMatches(), []);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const shown = matches ? applyFilter(matches, filter) : [];

  return (
    <main className="screen">
      <div className="header">
        <h1 className="screen-title">Matches</h1>
        <span style={{ display: 'flex', gap: 14 }}>
          <button type="button" className="link-btn" onClick={() => go('tournaments')}>Tournaments</button>
          <button type="button" className="link-btn" onClick={() => go('trash')}>Trash</button>
        </span>
      </div>
      {matches && matches.length === 0 ? (
        <EmptyState icon="matches" title="No matches yet"
          action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Every match you log appears here, with filters for singles, doubles and tournaments.
        </EmptyState>
      ) : (
        <>
          <Chips label="Filter matches" value={filter} options={filters} onChange={setFilter} />
          {matches && shown.length === 0 && <p className="muted">No matches match this filter.</p>}
          {shown.map((m) => <MatchRow key={m.id} match={m} onOpen={() => go('match', m.id)} />)}
        </>
      )}
      <button type="button" className="btn btn-outline" onClick={() => go('backfill')}>Add an old match</button>
    </main>
  );
}
