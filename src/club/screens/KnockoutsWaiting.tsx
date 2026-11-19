import type { ClubMatch, Division } from '../types';
import { knockoutBlockers } from '../plan';

/** "Knockouts are waiting on these N matches": the unfinished pool matches holding up each event's knockout draw. */
export function KnockoutsWaiting({ divisions, matches, who, onOpen, openLabel = 'Fix' }: {
  divisions: Division[]; matches: ClubMatch[]; who: (m: ClubMatch) => string; onOpen?: (m: ClubMatch) => void; openLabel?: string;
}) {
  const blockers = knockoutBlockers(divisions, matches);
  if (!blockers.length) return null;
  return (
    <section className="card" aria-label="Knockouts waiting" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blockers.map(({ division, waiting }) => (
        <div key={division.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 className="cap" style={{ margin: 0 }}>{divisions.length > 1 ? `${division.name}: ` : ''}Knockouts are waiting on {waiting.length === 1 ? 'this match' : `these ${waiting.length} matches`}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {waiting.map((m) => (
              <li key={m.id} className="between" style={{ gap: 8 }}>
                <span style={{ minWidth: 0 }}>{who(m)}{m.court ? <span className="mut"> · Court {m.court}</span> : null}{m.status === 'live' ? <span className="mut"> · playing now</span> : null}</span>
                {onOpen && <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} aria-label={`${openLabel}: ${who(m)}`} onClick={() => onOpen(m)}>{openLabel}</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mut" style={{ margin: 0, fontSize: 13 }}>If a team didn’t turn up, give the other side a walkover so the knockouts can be drawn.</p>
    </section>
  );
}
