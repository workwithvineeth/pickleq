import type { Go } from '../../navigation';
import { backend } from '../index';
import { pendingClubMatches } from '../personal';
import { useLoad } from './common';

/** The Club card on Home. Shows how many club matches are waiting to be added to your history. */
export default function ClubHomeCard({ go }: { go: Go }) {
  const pending = useLoad(async () => {
    const b = backend();
    if (!b || !(await b.currentUser())) return null;
    return (await pendingClubMatches(b)).length;
  }, []);
  const n = pending.data ?? 0;
  return (
    <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('club')}>
      <span>{n > 0 ? `Club · ${n} ${n === 1 ? 'match' : 'matches'} to add to your history` : 'Club'}</span><span>›</span>
    </button>
  );
}
