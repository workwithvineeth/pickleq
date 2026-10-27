import { EmptyState } from '../components/EmptyState';

export function Train() {
  return (
    <main className="screen">
      <h1 className="screen-title">Training</h1>
      <EmptyState icon="train" title="No sessions yet">
        Training sessions, drill success counts, goals and streaks will live here.
      </EmptyState>
    </main>
  );
}
