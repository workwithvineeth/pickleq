import type { Go } from '../../navigation';
import { backend } from '../index';
import { pendingClubMatches } from '../personal';
import { useLoad } from './common';

/** Club button at the top of Home, in the Paddle Q style: maroon pill, serif word, the logo's ball. */
export default function ClubHeaderButton({ go }: { go: Go }) {
  const pending = useLoad(async () => {
    const b = backend();
    if (!b || !(await b.currentUser())) return 0;
    return (await pendingClubMatches(b)).length;
  }, []);
  const n = pending.data ?? 0;
  return (
    <button type="button" className="club-pill" aria-label={n ? `Club, ${n} ${n === 1 ? 'match' : 'matches'} to add to your history` : 'Club'} onClick={() => go('club')}>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
      <span>Club</span>
      {n > 0 && <span className="club-pill-dot" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
    </button>
  );
}
