import { EmptyState } from '../components/EmptyState';
import type { Route } from '../navigation';

export function Matches({ go }: { go: (r: Route) => void }) {
  return (
    <main className="screen">
      <h1 className="screen-title">Matches</h1>
      <EmptyState
        icon="matches"
        title="No matches yet"
        action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}
      >
        Every match you log appears here, with filters for singles, doubles and tournaments.
      </EmptyState>
    </main>
  );
}
