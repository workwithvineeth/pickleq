import { EmptyState } from '../components/EmptyState';

export function Stats() {
  return (
    <main className="screen">
      <h1 className="screen-title">Stats</h1>
      <EmptyState icon="stats" title="No stats yet">
        Win rates, rating trends and charts appear after your first few matches.
      </EmptyState>
    </main>
  );
}
