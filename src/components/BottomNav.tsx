import { Icon } from './Icon';
import type { Tab } from '../navigation';

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'matches', label: 'Matches' },
  { id: 'events', label: 'Events' },
  { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' },
  { id: 'coach', label: 'Coach' },
];

export function BottomNav({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav className="nav" aria-label="Main">
      {/* The Events tab only exists in Club builds (written out, not via isClubEnabled, so other builds drop it). */}
      {tabs.filter((t) => t.id !== 'events' || import.meta.env.VITE_CLUB === 'on').map((t) => (
        <button key={t.id} type="button" className="nav-btn" aria-current={active === t.id ? 'page' : undefined} onClick={() => onSelect(t.id)}>
          <Icon name={t.id} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
