import { EmptyState } from '../components/EmptyState';

export function Coach() {
  return (
    <main className="screen">
      <h1 className="screen-title">Coach</h1>
      <EmptyState icon="coach" title="Your Claude coach">
        Claude will analyse your matches, training and notes once there is data to work with.
      </EmptyState>
    </main>
  );
}
