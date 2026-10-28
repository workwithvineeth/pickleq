import type { Format, Game, Match, Outcome } from './types';

export type Check = { ok: true } | { ok: false; message: string };
const ok: Check = { ok: true };
const fail = (message: string): Check => ({ ok: false, message });

const isScore = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** A finished game: winner reaches the target, wins by 2, and past the target the margin is exactly 2. */
export function checkGame(format: Format, you: number | null, them: number | null): Check {
  if (!isScore(you) || !isScore(them)) return fail('Enter both scores');
  if (you === them) return fail('A game can’t end level');
  const hi = Math.max(you, them);
  const lo = Math.min(you, them);
  if (hi < format.pointsTo) return fail(`The winner needs at least ${format.pointsTo}`);
  if (format.golden) {
    // Golden point: nobody goes past the target, and a 1-point margin is only possible from the golden point.
    if (hi > format.pointsTo) return fail(`With golden point, the winner finishes on exactly ${format.pointsTo}`);
    return ok;
  }
  if (hi - lo < 2) return fail('The winner must win by 2');
  if (hi > format.pointsTo && hi - lo !== 2) return fail(`Past ${format.pointsTo}, the margin must be exactly 2`);
  return ok;
}

export function checkMomentum(game: Game): Check {
  if (game.momentum === 'neither') return ok;
  if (!isScore(game.you) || !isScore(game.them)) return ok;
  const wonGame = game.you > game.them;
  if (game.momentum === 'dominated') {
    return wonGame ? ok : fail('“Dominated” is only for games you won');
  }
  const fy = game.fromYou;
  const ft = game.fromThem;
  if (!isScore(fy) || !isScore(ft)) return fail('Enter the score it happened from');
  if (fy > game.you || ft > game.them) return fail('The “from” score can’t be above the final score');
  if (game.momentum === 'came-back') {
    if (!wonGame) return fail('A comeback needs a win. Did you mean “lost a lead”?');
    if (fy >= ft) return fail('To come back, you must have been behind');
    return ok;
  }
  if (wonGame) return fail('Losing a lead means you lost the game. Did you mean “came back”?');
  if (fy <= ft) return fail('To lose a lead, you must have been ahead');
  return ok;
}

/** How many games a best-of needs and which games are still needed. */
export function gamesNeeded(format: Format, games: Game[]): number {
  if (format.bestOf === 1) return 1;
  const [g1, g2] = games;
  const w = (g?: Game) => (g && isScore(g.you) && isScore(g.them) ? Math.sign(g.you - g.them) : 0);
  // A third game is only played when the first two are split.
  return w(g1) !== 0 && w(g2) !== 0 && w(g1) !== w(g2) ? 3 : 2;
}

export interface MatchDraftCheck {
  ok: boolean;
  /** One message per game index, when that game has a problem. */
  gameMessages: (string | null)[];
  message: string | null;
  won: boolean | null;
}

/** Validates the score part of a match and works out who won. */
export function checkMatch(format: Format, outcome: Outcome, games: Game[], wonByChoice: boolean | null): MatchDraftCheck {
  if (outcome !== 'played') {
    if (wonByChoice === null) return { ok: false, gameMessages: [], message: 'Choose who won', won: null };
    if (outcome === 'retired') {
      const bad = games.findIndex((g) => (g.you !== null && !isScore(g.you)) || (g.them !== null && !isScore(g.them)));
      if (bad >= 0) return { ok: false, gameMessages: [], message: 'Scores must be whole numbers', won: null };
    }
    return { ok: true, gameMessages: [], message: null, won: wonByChoice };
  }
  const needed = gamesNeeded(format, games);
  const relevant = games.slice(0, needed);
  const gameMessages = relevant.map((g) => {
    const s = checkGame(format, g.you, g.them);
    if (!s.ok) return s.message;
    const m = checkMomentum(g);
    return m.ok ? null : m.message;
  });
  while (gameMessages.length < needed) gameMessages.push('Enter both scores');
  const firstBad = gameMessages.findIndex((m) => m !== null);
  if (firstBad >= 0) {
    const label = needed > 1 ? `Game ${firstBad + 1}: ` : '';
    return { ok: false, gameMessages, message: label + gameMessages[firstBad], won: null };
  }
  const wins = relevant.filter((g) => (g.you as number) > (g.them as number)).length;
  const won = format.bestOf === 1 ? wins === 1 : wins >= 2;
  return { ok: true, gameMessages, message: null, won };
}

export function scoreLine(match: Pick<Match, 'outcome' | 'games'>): string {
  const played = match.games.filter((g) => isScore(g.you) && isScore(g.them)).map((g) => `${g.you}–${g.them}`);
  if (match.outcome === 'walkover') return 'Walkover';
  if (match.outcome === 'retired') return played.length ? `${played.join(' · ')} (retired)` : 'Retired';
  return played.join(' · ');
}

export function formatLabel(f: Format): string {
  const games = f.bestOf === 1 ? '1 game' : 'Best of 3';
  return `${games} to ${f.pointsTo} · ${f.scoring === 'sideout' ? 'side-out' : 'rally'}${f.golden ? ' · golden point' : ''}`;
}

export function momentumLabel(g: Game): string | null {
  switch (g.momentum) {
    case 'came-back': return `Came back from ${g.fromYou}–${g.fromThem}`;
    case 'lost-lead': return `Lost the lead from ${g.fromYou}–${g.fromThem}`;
    case 'dominated': return 'Dominated';
    default: return null;
  }
}
