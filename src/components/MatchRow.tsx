import { scoreLine } from '../domain/scoring';
import type { Match } from '../domain/types';

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function whoLine(m: Match): string {
  const partner = m.participants.find((p) => p.role === 'partner');
  const opps = m.participants.filter((p) => p.role === 'opponent' && p.name).map((p) => (p.rating !== undefined ? `${p.name} (${p.rating})` : p.name));
  const vs = opps.length ? `vs ${opps.join(' & ')}` : 'Opponents not named';
  return partner?.name ? `with ${partner.name} · ${vs}` : vs;
}

export const typeLabel = { singles: 'Singles', doubles: 'Doubles', mixed: 'Mixed' } as const;
export const categoryLabel = { casual: 'Casual', practice: 'Practice', tournament: 'Tournament' } as const;

export function MatchRow({ match, onOpen }: { match: Match; onOpen?: () => void }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag {...(onOpen ? { type: 'button' as const, onClick: onOpen, 'aria-label': `${match.won ? 'Win' : 'Loss'} ${scoreLine(match)}, ${shortDate(match.date)}` } : {})} className="match-row">
      <span className={`result ${match.won ? 'result-w' : 'result-l'}`} aria-hidden="true">{match.won ? 'W' : 'L'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 500 }}>{scoreLine(match)}</span>
          <span className="small muted">{shortDate(match.date)}</span>
        </span>
        <span className="small muted" style={{ display: 'block' }}>{whoLine(match)}</span>
        <span className="meta">
          <span className="pill">{typeLabel[match.type]}</span>
          <span className="pill">{categoryLabel[match.category]}</span>
          {match.status === 'incomplete' && <span className="pill pill-warn">Needs details</span>}
          {match.backfilled && <span className="pill">Backfilled</span>}
        </span>
      </span>
    </Tag>
  );
}
