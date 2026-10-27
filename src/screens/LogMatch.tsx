import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';

export function LogMatch({ onClose }: { onClose: () => void }) {
  return (
    <main className="screen" aria-labelledby="log-title">
      <header className="header">
        <h1 id="log-title" className="screen-title">Log match</h1>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>
      <EmptyState icon="ball" title="Coming in the next update">
        The quick score grid, momentum, tags and energy arrive with the next PICKLEQ update.
      </EmptyState>
    </main>
  );
}
