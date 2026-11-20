import type { PublicTournament } from '../../club/backend';
import { Dna } from './Dna';
import { ralliesOf } from './rallies';

type Match = PublicTournament['matches'][number];
const doublesOf = (d: PublicTournament, m: Match) => d.divisions.find((x) => x.id === m.divisionId)?.kind !== 'singles';

/** Match DNA: one mark per rally, drawn only from the referee's rally record. Nothing shows when a game has none
 *  (for example a result typed in afterwards). `all` shows every game (Results); otherwise only the game being played. */
export function MatchDna({ d, m, all = false }: { d: PublicTournament; m: Match; all?: boolean }) {
  const doubles = doublesOf(d, m);
  const games = (all ? m.games : m.games.slice(-1)).map((g, i, arr) => ({ n: all ? i + 1 : m.games.length, r: ralliesOf(g, doubles), last: i === arr.length - 1 }))
    .filter((g) => g.r.length > 0);
  if (!games.length) return null;
  return <div className="mdna" role="img" aria-label={games.map((g) => `Game ${g.n}: ${g.r.length} ${g.r.length === 1 ? 'rally' : 'rallies'}`).join('. ')}>
    <span className="cap">Match DNA · one mark per rally</span>
    {games.map((g) => <div key={g.n} className="mdna-g">{games.length > 1 && <span className="mdna-n">G{g.n}</span>}<Dna rallies={g.r} /></div>)}
  </div>;
}
